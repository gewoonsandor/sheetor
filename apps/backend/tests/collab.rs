//! The live-editing hub, driven directly: channels stand in for sockets, no database.

mod common;

use axum::extract::ws::Message;
use common::song_state;
use sheetor_backend::collab::hub::Hub;
use sheetor_backend::collab::room::Member;
use sheetor_backend::collab::summary::{ROOT, load_doc, summarize};
use sheetor_backend::database::schemas::roles::Role;
use sheetor_backend::error::collab::CollabError;
use tokio::sync::mpsc::{self, UnboundedReceiver};
use uuid::Uuid;
use yrs::{Map, ReadTxn, Transact};

struct Seat {
    conn: Uuid,
    rx: UnboundedReceiver<Message>,
}

fn join(hub: &Hub, song: Uuid, stored: &[u8], role: Role) -> Seat {
    let (tx, rx) = mpsc::unbounded_channel();
    let member = Member {
        user_id: 1,
        name: "Ada".to_owned(),
        role,
        cursor: None,
        tx,
    };
    let conn = Uuid::new_v4();
    hub.join(song, conn, member, stored).unwrap();
    Seat { conn, rx }
}

/// The diff a browser holding `stored` sends after renaming the song.
fn retitled(stored: &[u8], title: &str) -> Vec<u8> {
    let doc = load_doc(stored).unwrap();
    let before = doc.transact().state_vector();
    let song = doc.get_or_insert_map(ROOT);
    let mut txn = doc.transact_mut();
    song.insert(&mut txn, "title", title);
    txn.encode_diff_v1(&before)
}

fn binary_frames(seat: &mut Seat) -> usize {
    std::iter::from_fn(|| seat.rx.try_recv().ok())
        .filter(|message| matches!(message, Message::Binary(_)))
        .count()
}

fn title(hub: &Hub, song: Uuid) -> String {
    summarize(&hub.current_state(song).unwrap()).unwrap().title
}

#[test]
fn an_edit_reaches_everyone_but_its_author_once() {
    let (hub, song, stored) = (Hub::default(), Uuid::new_v4(), song_state("A"));
    let mut ada = join(&hub, song, &stored, Role::Editor);
    let mut ben = join(&hub, song, &stored, Role::Viewer);

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
