use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::oneshot;
use uuid::Uuid;

use super::flush;
use super::hub::Admission;
use super::protocol::{
    CLOSE_GONE, CLOSE_INVALID, CLOSE_REVOKED, CLOSE_ROOM_FULL, CLOSE_TOO_LARGE, CLOSE_TOO_MANY,
    CLOSE_UNAVAILABLE, ClientMessage, close,
};
use super::room::Member;
use crate::database::queries::songs;
use crate::database::schemas::roles::Role;
use crate::database::schemas::users::User;
use crate::error::collab::CollabError;
use crate::state::AppState;

/// Messages one socket may have waiting; a client that falls this far behind is dropped.
const QUEUE: usize = 64;
/// How long a finished session waits for its last messages, a Close among them, to go out.
const CLOSE_GRACE: Duration = Duration::from_secs(5);

/// One browser tab editing one song, from upgrade to close.
pub async fn run(socket: WebSocket, state: AppState, song: Uuid, user: User, role: Role) {
    let (sink, stream) = socket.split();
    let (tx, rx) = mpsc::channel(QUEUE);
    let mut forwarder = tokio::spawn(forward(rx, sink));
    let conn = Uuid::new_v4();

    match join(&state, song, conn, &user, role, &tx).await {
        Ok((_admission, out_of_room)) => {
            // A socket that can no longer be written to is as gone as one that closed, and so
            // is one the room dropped: kicked, or too slow to keep up.
            tokio::select! {
                () = read_loop(&state, song, conn, stream, &tx) => {}
                _ = &mut forwarder => {}
                _ = out_of_room => {}
            }
            leave(&state, song, conn).await;
        }
        Err(refusal) => {
            let _ = tx.try_send(refusal);
        }
    }

    drop(tx);
    // A client that stopped reading would hold the forwarder forever.
    if !forwarder.is_finished()
        && tokio::time::timeout(CLOSE_GRACE, &mut forwarder)
            .await
            .is_err()
    {
        forwarder.abort();
    }
}

/// Writes queued messages to the socket. A Close is the last: the session then ends without
/// waiting for the client's reply, which a client that ignores it would never send.
async fn forward(mut rx: Receiver<Message>, mut sink: SplitSink<WebSocket, Message>) {
    while let Some(message) = rx.recv().await {
        let last = matches!(message, Message::Close(_));
        if sink.send(message).await.is_err() || last {
            break;
        }
    }
}

/// Seats the connection in the song's room. The receiver resolves once it is out of the room
/// again; a refusal is the Close to send instead.
async fn join(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    user: &User,
    role: Role,
    tx: &Sender<Message>,
) -> Result<(Admission, oneshot::Receiver<()>), Message> {
    let admission = state
        .collab
        .admit(user.id)
        .ok_or_else(|| close(CLOSE_TOO_MANY, "too many live connections"))?;
    let Ok(Some(stored)) = songs::load_state(&state.db, song).await else {
        return Err(close(CLOSE_UNAVAILABLE, "song unavailable"));
    };
    let (in_room, out_of_room) = oneshot::channel();
    let member = Member::new(user.id, user.username.clone(), role, tx.clone(), in_room);
    match state.collab.join(song, conn, member, &stored) {
        Ok(()) => {}
        Err(CollabError::RoomFull) => return Err(close(CLOSE_ROOM_FULL, "room full")),
        Err(error) => {
            tracing::error!(%song, ?error, "stored song state does not load");
            return Err(close(CLOSE_UNAVAILABLE, "song unavailable"));
        }
    }
    recheck(state, song, conn, user.id, role).await;
    Ok((admission, out_of_room))
}

/// Access can change between the check that let this socket in and its joining the room, and a
/// revalidation running meanwhile would not have seen it. Only ever lowers the role: a stale
/// answer must not hand back what a later revalidation took away.
async fn recheck(state: &AppState, song: Uuid, conn: Uuid, user: i32, role: Role) {
    match songs::song_role(&state.db, user, song).await {
        Ok(Some(Some(now))) if now < role => state.collab.set_role(song, conn, now),
        Ok(Some(Some(_))) => {}
        Ok(Some(None)) => state.collab.kick(song, conn, CLOSE_REVOKED),
        Ok(None) => state.collab.close_room(song, CLOSE_GONE),
        Err(error) => tracing::error!(%song, ?error, "rechecking live access failed"),
    }
}

async fn read_loop(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    mut stream: SplitStream<WebSocket>,
    tx: &Sender<Message>,
) {
    while let Some(Ok(message)) = stream.next().await {
        match message {
            Message::Binary(update) => {
                if !on_update(state, song, conn, &update, tx) {
                    break;
                }
            }
            Message::Text(json) => on_text(state, song, conn, json.as_str()),
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => {}
        }
    }
}

/// Returns false when the connection must end because the update was refused.
fn on_update(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    update: &[u8],
    tx: &Sender<Message>,
) -> bool {
    let refusal = match state.collab.apply(song, conn, update) {
        Ok(true) => {
            flush::schedule(state.clone(), song);
            return true;
        }
        Ok(false) | Err(CollabError::NotEditor) => return true,
        Err(CollabError::TooLarge) => close(CLOSE_TOO_LARGE, "song too large"),
        Err(error) => {
            tracing::warn!(%song, ?error, "rejected live update");
            close(CLOSE_INVALID, "invalid update")
        }
    };
    let _ = tx.try_send(refusal);
    false
}

fn on_text(state: &AppState, song: Uuid, conn: Uuid, json: &str) {
    if let Ok(ClientMessage::Cursor { cursor }) = serde_json::from_str(json)
        && cursor.is_valid()
        && let Some(wait) = state.collab.set_cursor(song, conn, cursor)
    {
        let hub = state.collab.clone();
        tokio::spawn(async move {
            tokio::time::sleep(wait).await;
            hub.flush_presence(song);
        });
    }
}

async fn leave(state: &AppState, song: Uuid, conn: Uuid) {
    flush::save(state, song, |room| room.leave(conn)).await;
    state.collab.release(song);
}
