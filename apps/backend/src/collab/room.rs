use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::ws::Message;
use tokio::sync::mpsc::Sender;
use tokio::sync::{Mutex as AsyncMutex, oneshot};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

use super::protocol::{CLOSE_REVOKED, Cursor, Peer, ServerMessage, close, text};
use super::summary::load_doc;
use crate::database::schemas::roles::Role;
use crate::error::collab::CollabError;

/// Live connections one song takes at once.
pub const MAX_MEMBERS: usize = 32;
/// What a live document may grow to, encoded.
pub const MAX_DOC_BYTES: usize = 8 << 20;
/// Presence goes out at most this often: it is the whole list, to everyone, so sending it on
/// every cursor move costs the square of the room.
const PRESENCE_GAP: Duration = Duration::from_millis(50);

pub struct Member {
    user_id: i32,
    name: String,
    role: Role,
    cursor: Option<Cursor>,
    tx: Sender<Message>,
    /// Dropped with the member, which tells its session it is out of the room.
    _in_room: oneshot::Sender<()>,
}

impl Member {
    pub fn new(
        user_id: i32,
        name: String,
        role: Role,
        tx: Sender<Message>,
        in_room: oneshot::Sender<()>,
    ) -> Self {
        Self {
            user_id,
            name,
            role,
            cursor: None,
            tx,
            _in_room: in_room,
        }
    }
}

/// Document state not yet written to the database.
pub struct Snapshot {
    pub state: Vec<u8>,
    pub updated_by: Option<i32>,
}

/// One open song: its live document and everyone connected to it.
pub struct Room {
    doc: Doc,
    members: HashMap<Uuid, Member>,
    dirty: bool,
    flush_scheduled: bool,
    last_editor: Option<i32>,
    /// The encoded size when last measured plus every update applied since: an overestimate,
    /// measured again before it refuses anything.
    size: usize,
    presence_sent: Instant,
    presence_due: bool,
    saving: Arc<AsyncMutex<()>>,
}

impl Room {
    pub fn load(state: &[u8]) -> Result<Self, CollabError> {
        Ok(Self {
            doc: load_doc(state)?,
            members: HashMap::new(),
            dirty: false,
            flush_scheduled: false,
            last_editor: None,
            size: state.len(),
            presence_sent: Instant::now(),
            presence_due: false,
            saving: Arc::default(),
        })
    }

    pub fn state(&self) -> Vec<u8> {
        self.doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
    }

    pub fn saving(&self) -> Arc<AsyncMutex<()>> {
        self.saving.clone()
    }

    /// Queues the welcome and the whole document for a new member, under this room's lock, so
    /// nothing relayed can overtake them.
    pub fn add(&mut self, id: Uuid, member: Member) -> Result<(), CollabError> {
        if self.members.len() >= MAX_MEMBERS {
            return Err(CollabError::RoomFull);
        }
        let welcome = ServerMessage::Welcome {
            connection_id: id,
            role: member.role,
        };
        let _ = member.tx.try_send(text(&welcome));
        let _ = member.tx.try_send(Message::Binary(self.state().into()));
        self.members.insert(id, member);
        self.send_presence();
        Ok(())
    }

    /// Removes a member and, when they were the last, returns what still needs saving.
    pub fn leave(&mut self, id: Uuid) -> Option<Snapshot> {
        if self.members.remove(&id).is_some() {
            self.send_presence();
        }
        if self.members.is_empty() {
            self.take_dirty()
        } else {
            None
        }
    }

    pub fn is_idle(&self) -> bool {
        self.members.is_empty() && !self.dirty
    }

    /// Applies an editor's update and relays it to everyone else. Returns true when
    /// this update is the first unsaved one, so the caller should schedule a flush.
    pub fn apply(&mut self, from: Uuid, update: &[u8]) -> Result<bool, CollabError> {
        let author = self
            .members
            .get(&from)
            .filter(|member| member.role >= Role::Editor)
            .ok_or(CollabError::NotEditor)?
            .user_id;
        if self.size + update.len() > MAX_DOC_BYTES {
            self.size = self.state().len();
        }
        if self.size + update.len() > MAX_DOC_BYTES {
            return Err(CollabError::TooLarge);
        }
        self.doc
            .transact_mut()
            .apply_update(Update::decode_v1(update)?)?;

        self.size += update.len();
        self.dirty = true;
        self.last_editor = Some(author);
        let relayed = Message::Binary(Bytes::copy_from_slice(update));
        self.deliver(&relayed, |id| id != from);
        Ok(!std::mem::replace(&mut self.flush_scheduled, true))
    }

    /// Keeps the latest cursor but sends presence at most every `PRESENCE_GAP`. When this move
    /// is the first held back, returns how long until `flush_presence` should send it.
    pub fn set_cursor(&mut self, id: Uuid, cursor: Cursor) -> Option<Duration> {
        self.members.get_mut(&id)?.cursor = Some(cursor);
        let wait = PRESENCE_GAP.saturating_sub(self.presence_sent.elapsed());
        if wait.is_zero() {
            self.send_presence();
            return None;
        }
        (!std::mem::replace(&mut self.presence_due, true)).then_some(wait)
    }

    pub fn flush_presence(&mut self) {
        if self.presence_due {
            self.send_presence();
        }
    }

    pub fn set_role(&mut self, id: Uuid, role: Role) {
        let Some(member) = self
            .members
            .get_mut(&id)
            .filter(|member| member.role != role)
        else {
            return;
        };
        member.role = role;
        self.deliver(&text(&ServerMessage::Role { role }), |to| to == id);
        self.send_presence();
    }

    /// Brings a user's connections in line with their role now, closing them when it is gone.
    pub fn set_access(&mut self, user: i32, role: Option<Role>) {
        for id in self.connections_of(user) {
            match role {
                Some(role) => self.set_role(id, role),
                None => self.kick(id, CLOSE_REVOKED),
            }
        }
    }

    /// Takes a connection out of the room at once, so it gets no more edits or presence and its
    /// updates are refused, then closes it. Waiting for the client to answer the Close would let
    /// one that ignores it go on editing with the role it had.
    pub fn kick(&mut self, id: Uuid, code: u16) {
        if let Some(member) = self.members.remove(&id) {
            let _ = member.tx.try_send(close(code, "access changed"));
            self.send_presence();
        }
    }

    pub fn kick_user(&mut self, user: i32, code: u16) {
        for id in self.connections_of(user) {
            self.kick(id, code);
        }
    }

    pub fn close_all(&mut self, code: u16) {
        for (_, member) in self.members.drain() {
            let _ = member.tx.try_send(close(code, "song closed"));
        }
    }

    pub fn take_dirty(&mut self) -> Option<Snapshot> {
        self.flush_scheduled = false;
        std::mem::take(&mut self.dirty).then(|| Snapshot {
            state: self.state(),
            updated_by: self.last_editor,
        })
    }

    pub fn user_ids(&self) -> impl Iterator<Item = i32> + '_ {
        self.members.values().map(|member| member.user_id)
    }

    fn connections_of(&self, user: i32) -> Vec<Uuid> {
        self.members
            .iter()
            .filter(|(_, member)| member.user_id == user)
            .map(|(id, _)| *id)
            .collect()
    }

    fn presence(&self) -> Message {
        let peers = self
            .members
            .iter()
            .map(|(id, member)| Peer {
                connection_id: *id,
                user_id: member.user_id,
                name: member.name.clone(),
                role: member.role,
                cursor: member.cursor.clone(),
            })
            .collect();
        text(&ServerMessage::Presence { peers })
    }

    fn send_presence(&mut self) {
        self.presence_due = false;
        self.presence_sent = Instant::now();
        let presence = self.presence();
        self.deliver(&presence, |_| true);
    }

    /// Queues `message` for the members `to` picks. One whose queue is full has stopped reading,
    /// and holding more for it would grow without bound: it is dropped, which ends its session.
    fn deliver(&mut self, message: &Message, to: impl Fn(Uuid) -> bool) {
        let before = self.members.len();
        self.members
            .retain(|id, member| !to(*id) || member.tx.try_send(message.clone()).is_ok());
        if self.members.len() < before {
            self.send_presence();
        }
    }
}
