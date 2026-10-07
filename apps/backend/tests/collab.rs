//! The live-editing hub, driven directly: channels stand in for sockets, no database.

mod common;

use std::time::Duration;

use axum::extract::ws::Message;
use common::song_state;
use serde_json::Value;
use sheetor_backend::collab::hub::{Hub, MAX_USER_CONNECTIONS};
use sheetor_backend::collab::protocol::{CLOSE_SIGNED_OUT, Cursor};
use sheetor_backend::collab::room::{MAX_DOC_BYTES, MAX_MEMBERS, Member};
use sheetor_backend::collab::summary::{ROOT, load_doc, summarize};
use sheetor_backend::database::schemas::roles::Role;
use sheetor_backend::error::collab::CollabError;
use tokio::sync::mpsc::{self, Receiver};
use tokio::sync::oneshot::{self, error::TryRecvError};
use uuid::Uuid;
use yrs::{Any, Map, MapPrelim, ReadTxn, StateVector, Transact};

struct Seat {
    conn: Uuid,
    rx: Receiver<Message>,
    /// Closes once the hub has dropped the member.
    in_room: oneshot::Receiver<()>,
}

impl Seat {
    fn messages(&mut self) -> Vec<Message> {
        std::iter::from_fn(|| self.rx.try_recv().ok()).collect()
    }

    fn is_seated(&mut self) -> bool {
        matches!(self.in_room.try_recv(), Err(TryRecvError::Empty))
    }
}

fn seat(
    hub: &Hub,
    song: Uuid,
    stored: &[u8],
    user_id: i32,
    role: Role,
    queue: usize,
) -> Result<Seat, CollabError> {
    let (tx, rx) = mpsc::channel(queue);
    let (in_room, out) = oneshot::channel();
    let member = Member::new(user_id, "Ada".to_owned(), role, tx, in_room);
    let conn = Uuid::new_v4();
    hub.join(song, conn, member, stored)?;
    Ok(Seat {
        conn,
        rx,
        in_room: out,
    })
}

fn join(hub: &Hub, song: Uuid, stored: &[u8], role: Role) -> Seat {
    seat(hub, song, stored, 1, role, 64).unwrap()
}

/// The diff a browser holding `stored` sends after setting `key`.
fn edited(stored: &[u8], key: &str, value: &str) -> Vec<u8> {
    let doc = load_doc(stored).unwrap();
    let before = doc.transact().state_vector();
    let song = doc.get_or_insert_map(ROOT);
    let mut txn = doc.transact_mut();
    song.insert(&mut txn, key, value);
    txn.encode_diff_v1(&before)
}

fn retitled(stored: &[u8], title: &str) -> Vec<u8> {
    edited(stored, "title", title)
}

fn binary_frames(seat: &mut Seat) -> usize {
    seat.messages()
        .iter()
        .filter(|message| matches!(message, Message::Binary(_)))
        .count()
}

fn presences(seat: &mut Seat) -> Vec<Value> {
    seat.messages()
        .into_iter()
        .filter_map(|message| match message {
            Message::Text(json) => serde_json::from_str::<Value>(json.as_str()).ok(),
            _ => None,
        })
        .filter(|message| message["type"] == "presence")
        .collect()
}

fn title(hub: &Hub, song: Uuid) -> String {
    summarize(&hub.current_state(song).unwrap()).unwrap().title
}

#[test]
fn an_edit_reaches_everyone_but_its_author_once() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let mut ada = join(&hub, song, &stored, Role::Editor);
    let mut ben = join(&hub, song, &stored, Role::Viewer);
    assert_eq!(binary_frames(&mut ada), 1, "the whole document on joining");
    assert_eq!(binary_frames(&mut ben), 1, "the whole document on joining");

    hub.apply(song, ada.conn, &retitled(&stored, "B")).unwrap();

    assert_eq!(binary_frames(&mut ada), 0);
    assert_eq!(binary_frames(&mut ben), 1);
    assert_eq!(title(&hub, song), "B");
}

#[test]
fn a_viewer_cannot_change_the_document() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ben = join(&hub, song, &stored, Role::Viewer);

    let refused = hub.apply(song, ben.conn, &retitled(&stored, "B"));

    assert!(matches!(refused, Err(CollabError::NotEditor)));
    assert_eq!(title(&hub, song), "A");
}

#[test]
fn only_the_first_unsaved_edit_schedules_a_flush() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ada = join(&hub, song, &stored, Role::Editor);

    assert!(hub.apply(song, ada.conn, &retitled(&stored, "B")).unwrap());
    assert!(!hub.apply(song, ada.conn, &retitled(&stored, "C")).unwrap());

    assert!(hub.take_dirty(song).is_some());
    assert!(hub.take_dirty(song).is_none());
}

#[test]
fn the_last_member_leaving_hands_over_unsaved_state_and_closes_the_room() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ada = join(&hub, song, &stored, Role::Editor);
    let ben = join(&hub, song, &stored, Role::Viewer);
    hub.apply(song, ada.conn, &retitled(&stored, "B")).unwrap();

    assert!(hub.leave(song, ada.conn).is_none(), "Ben is still here");
    let snapshot = hub.leave(song, ben.conn).expect("unsaved edits");
    assert_eq!(summarize(&snapshot.state).unwrap().title, "B");
    assert_eq!(snapshot.updated_by, Some(1));

    hub.release(song);
    assert!(hub.current_state(song).is_none());
}

#[test]
fn a_kicked_editor_is_closed_and_can_no_longer_edit() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let mut ada = join(&hub, song, &stored, Role::Editor);
    let mut ben = join(&hub, song, &stored, Role::Viewer);
    ben.messages();

    hub.kick(song, ada.conn, 4403);
    assert!(
        matches!(ada.messages().last(), Some(Message::Close(Some(frame))) if frame.code == 4403)
    );
    assert!(!ada.is_seated());

    // A client that ignores the Close still cannot write, and nobody hears from it.
    let refused = hub.apply(song, ada.conn, &retitled(&stored, "B"));
    assert!(matches!(refused, Err(CollabError::NotEditor)));
    assert_eq!(title(&hub, song), "A");
    assert_eq!(binary_frames(&mut ben), 0);
}

/// An update adding `["x"] = [[…[null]…]]` nested `depth` arrays deep, spliced into one yrs wrote.
fn nested_any_update(stored: &[u8], depth: usize) -> Vec<u8> {
    let doc = load_doc(stored).unwrap();
    let before = doc.transact().state_vector();
    let song = doc.get_or_insert_map(ROOT);
    let mut txn = doc.transact_mut();
    song.insert(&mut txn, "x", Any::Array([Any::Null].into()));
    let update = txn.encode_diff_v1(&before);
    // The value is written as tag 117 (array), length 1, tag 126 (null).
    let at = update.windows(3).position(|w| w == [117, 1, 126]).unwrap();
    let nested: Vec<u8> = std::iter::repeat_n([117, 1], depth)
        .flatten()
        .chain([126])
        .collect();
    [&update[..at], &nested, &update[at + 3..]].concat()
}

#[test]
fn a_deeply_nested_value_is_refused_instead_of_crashing_the_server() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ada = join(&hub, song, &stored, Role::Editor);

    assert!(
        hub.apply(song, ada.conn, &nested_any_update(&stored, 3))
            .is_ok()
    );
    // Unbounded, decoding recursed once per level and a few kilobytes overflowed the stack.
    let refused = hub.apply(song, ada.conn, &nested_any_update(&stored, 20_000));
    assert!(
        matches!(refused, Err(CollabError::Decode(_))),
        "{refused:?}"
    );
}

#[test]
fn a_deeply_nested_document_still_summarises() {
    let stored = song_state("A");
    let doc = load_doc(&stored).unwrap();
    let mut map = doc.get_or_insert_map(ROOT);
    let mut txn = doc.transact_mut();
    for _ in 0..20_000 {
        map = map.insert(&mut txn, "x", MapPrelim::default());
    }
    let state = txn.encode_state_as_update_v1(&StateVector::default());
    drop(txn);

    assert_eq!(summarize(&state).unwrap().title, "A");
}

#[test]
fn a_member_too_slow_to_keep_up_is_dropped_and_the_room_goes_on() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    // Room for her welcome, the document and two presence lists, and nothing more.
    let mut ada = seat(&hub, song, &stored, 1, Role::Viewer, 4).unwrap();
    let mut ben = join(&hub, song, &stored, Role::Editor);

    hub.apply(song, ben.conn, &retitled(&stored, "B")).unwrap();

    assert!(!ada.is_seated(), "her session is told to end");
    assert_eq!(ada.messages().len(), 4, "nothing is held past the limit");
    let last = presences(&mut ben).pop().unwrap();
    assert_eq!(
        last["peers"].as_array().unwrap().len(),
        1,
        "Ben hears she left"
    );
    assert_eq!(title(&hub, song), "B");
}

#[test]
fn a_full_room_turns_the_next_connection_away() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let queue = MAX_MEMBERS + 8;
    let seated: Vec<Seat> = (0..MAX_MEMBERS)
        .map(|_| seat(&hub, song, &stored, 1, Role::Viewer, queue).unwrap())
        .collect();

    let refused = seat(&hub, song, &stored, 2, Role::Viewer, queue);
    assert!(matches!(refused, Err(CollabError::RoomFull)));

    hub.leave(song, seated[0].conn);
    assert!(seat(&hub, song, &stored, 2, Role::Viewer, queue).is_ok());
}

#[test]
fn a_user_holds_a_bounded_number_of_live_connections() {
    let hub = Hub::default();
    let held: Vec<_> = (0..MAX_USER_CONNECTIONS)
        .map(|_| hub.admit(1).unwrap())
        .collect();

    assert!(hub.admit(1).is_none());
    assert!(hub.admit(2).is_some(), "other users are not affected");
    drop(held);
    assert!(
        hub.admit(1).is_some(),
        "closed connections give their place back"
    );
}

fn at_beat(beat: usize) -> Cursor {
    Cursor {
        track_id: "t".to_owned(),
        measure_id: "m".to_owned(),
        beat_id: format!("b{beat}"),
    }
}

#[test]
fn a_burst_of_cursor_moves_sends_a_few_presence_lists_ending_on_the_latest() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ada = join(&hub, song, &stored, Role::Editor);
    let mut ben = join(&hub, song, &stored, Role::Viewer);
    ben.messages();

    for beat in 0..1000 {
        hub.set_cursor(song, ada.conn, at_beat(beat));
    }
    hub.flush_presence(song);

    let sent = presences(&mut ben);
    assert!(
        sent.len() < 10,
        "{} presence lists for 1000 moves",
        sent.len()
    );
    let peers = sent.last().unwrap()["peers"].as_array().unwrap();
    let ada_conn = ada.conn.to_string();
    let ada_peer = peers
        .iter()
        .find(|peer| peer["connection_id"] == ada_conn.as_str())
        .unwrap();
    assert_eq!(ada_peer["cursor"]["beat_id"], "b999");
}

#[test]
fn a_song_cannot_grow_past_its_size_limit() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let ada = join(&hub, song, &stored, Role::Editor);
    let chunk = "x".repeat(MAX_DOC_BYTES / 4);
    let edit = |key: &str| {
        let update = edited(&hub.current_state(song).unwrap(), key, &chunk);
        hub.apply(song, ada.conn, &update)
    };

    // Rewriting one value leaves the document its size: only real growth counts.
    for _ in 0..8 {
        edit("notes").unwrap();
    }
    let refused = (0..8)
        .map(|part| edit(&format!("part{part}")))
        .find(Result::is_err);

    assert!(
        matches!(refused, Some(Err(CollabError::TooLarge))),
        "{refused:?}"
    );
    assert!(hub.current_state(song).unwrap().len() <= MAX_DOC_BYTES);
}

#[test]
fn signing_out_closes_that_users_connections_and_no_one_elses() {
    let (hub, stored) = (Hub::default(), song_state("A"));
    let (one, two) = (Uuid::new_v4(), Uuid::new_v4());
    let mut ada_here = seat(&hub, one, &stored, 1, Role::Editor, 64).unwrap();
    let mut ada_there = seat(&hub, two, &stored, 1, Role::Editor, 64).unwrap();
    let mut ben = seat(&hub, one, &stored, 2, Role::Editor, 64).unwrap();
    ben.messages();

    hub.disconnect_user(1);

    for ada in [&mut ada_here, &mut ada_there] {
        let messages = ada.messages();
        assert!(
            matches!(messages.last(), Some(Message::Close(Some(frame))) if frame.code == CLOSE_SIGNED_OUT)
        );
        assert!(!ada.is_seated());
    }
    assert!(ben.is_seated());
    assert!(
        !ben.messages()
            .iter()
            .any(|message| matches!(message, Message::Close(_)))
    );
    assert!(hub.apply(one, ben.conn, &retitled(&stored, "B")).is_ok());
}

async fn pass_due(hub: &Hub) -> bool {
    tokio::time::timeout(Duration::from_millis(100), hub.refresh_requested())
        .await
        .is_ok()
}

#[tokio::test]
async fn access_changes_during_a_revalidation_queue_exactly_one_more_pass() {
    let hub = Hub::default();
    assert!(hub.request_refresh(), "the first request starts the worker");
    assert!(pass_due(&hub).await);

    for _ in 0..3 {
        assert!(!hub.request_refresh(), "only the first starts one");
    }
    assert!(
        pass_due(&hub).await,
        "requests made during a pass add one more"
    );
    assert!(!pass_due(&hub).await, "and only one");
}
