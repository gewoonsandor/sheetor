use axum::extract::ws::{Message, WebSocket};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use uuid::Uuid;

use super::flush;
use super::protocol::{
    CLOSE_INVALID, CLOSE_UNAVAILABLE, ClientMessage, ServerMessage, close, text,
};
use super::room::Member;
use crate::database::queries::songs;
use crate::database::schemas::roles::Role;
use crate::database::schemas::users::User;
use crate::error::collab::CollabError;
use crate::state::AppState;

/// One browser tab editing one song, from upgrade to close.
pub async fn run(socket: WebSocket, state: AppState, song: Uuid, user: User, role: Role) {
    let (sink, stream) = socket.split();
    let (tx, rx) = mpsc::unbounded_channel();
    let forwarder = tokio::spawn(forward(rx, sink));
    let conn = Uuid::new_v4();

    if join(&state, song, conn, &user, role, &tx).await {
        read_loop(&state, song, conn, stream, &tx).await;
        leave(&state, song, conn).await;
    } else {
        let _ = tx.send(close(CLOSE_UNAVAILABLE, "song unavailable"));
    }

    drop(tx);
    let _ = forwarder.await;
}

async fn forward(mut rx: UnboundedReceiver<Message>, mut sink: SplitSink<WebSocket, Message>) {
    while let Some(message) = rx.recv().await {
        if sink.send(message).await.is_err() {
            break;
        }
    }
}

async fn join(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    user: &User,
    role: Role,
    tx: &UnboundedSender<Message>,
) -> bool {
    let Ok(Some(stored)) = songs::load_state(&state.db, song).await else {
        return false;
    };
    let welcome = ServerMessage::Welcome {
        connection_id: conn,
        role,
    };
    let _ = tx.send(text(&welcome));
    let member = Member {
        user_id: user.id,
        name: user.username.clone(),
        role,
        cursor: None,
        tx: tx.clone(),
    };
    match state.collab.join(song, conn, member, &stored) {
        Ok(full) => tx.send(Message::Binary(full.into())).is_ok(),
        Err(error) => {
            tracing::error!(%song, ?error, "stored song state does not load");
            false
        }
    }
}

async fn read_loop(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    mut stream: SplitStream<WebSocket>,
    tx: &UnboundedSender<Message>,
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

/// Returns false when the connection must end because the update was unusable.
fn on_update(
    state: &AppState,
    song: Uuid,
    conn: Uuid,
    update: &[u8],
    tx: &UnboundedSender<Message>,
) -> bool {
    match state.collab.apply(song, conn, update) {
        Ok(true) => flush::schedule(state.clone(), song),
        Ok(false) | Err(CollabError::NotEditor) => {}
        Err(error) => {
            tracing::warn!(%song, ?error, "rejected live update");
            let _ = tx.send(close(CLOSE_INVALID, "invalid update"));
            return false;
        }
    }
    true
}

fn on_text(state: &AppState, song: Uuid, conn: Uuid, json: &str) {
    if let Ok(ClientMessage::Cursor { cursor }) = serde_json::from_str(json)
        && cursor.is_valid()
    {
        state.collab.set_cursor(song, conn, cursor);
    }
}

async fn leave(state: &AppState, song: Uuid, conn: Uuid) {
    if let Some(snapshot) = state.collab.leave(song, conn) {
        flush::persist(&state.db, song, snapshot).await;
    }
    state.collab.release(song);
}
