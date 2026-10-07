use axum::extract::ws::{CloseFrame, Message};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::database::schemas::roles::Role;

pub const CLOSE_INVALID: u16 = 4400;
/// The user signed out somewhere: the client reconnects, which signs it in again or fails.
pub const CLOSE_SIGNED_OUT: u16 = 4401;
pub const CLOSE_REVOKED: u16 = 4403;
pub const CLOSE_GONE: u16 = 4404;
pub const CLOSE_TOO_LARGE: u16 = 4413;
pub const CLOSE_TOO_MANY: u16 = 4429;
pub const CLOSE_ROOM_FULL: u16 = 4503;
pub const CLOSE_UNAVAILABLE: u16 = 1011;

const MAX_ID: usize = 64;

/// Where a collaborator's cursor sits, by the song's stable ids.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cursor {
    pub track_id: String,
    pub measure_id: String,
    pub beat_id: String,
}

impl Cursor {
    pub fn is_valid(&self) -> bool {
        [&self.track_id, &self.measure_id, &self.beat_id]
            .iter()
            .all(|id| (1..=MAX_ID).contains(&id.len()))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Peer {
    pub connection_id: Uuid,
    pub user_id: i32,
    pub name: String,
    pub role: Role,
    pub cursor: Option<Cursor>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Welcome { connection_id: Uuid, role: Role },
    Presence { peers: Vec<Peer> },
    Role { role: Role },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Cursor { cursor: Cursor },
}

pub fn text(message: &ServerMessage) -> Message {
    Message::Text(serde_json::to_string(message).unwrap_or_default().into())
}

pub fn close(code: u16, reason: &'static str) -> Message {
    Message::Close(Some(CloseFrame {
        code,
        reason: reason.into(),
    }))
}
