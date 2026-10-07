use std::collections::HashMap;

use axum::body::Bytes;
use axum::extract::ws::Message;
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

use super::protocol::{Cursor, Peer, ServerMessage, close, text};
use super::summary::load_doc;
use crate::database::schemas::roles::Role;
use crate::error::collab::CollabError;

pub struct Member {
    pub user_id: i32,
    pub name: String,
    pub role: Role,
    pub cursor: Option<Cursor>,
    pub tx: UnboundedSender<Message>,
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
}

impl Room {
    pub fn load(state: &[u8]) -> Result<Self, CollabError> {
        Ok(Self {
            doc: load_doc(state)?,
            members: HashMap::new(),
            dirty: false,
            flush_scheduled: false,
            last_editor: None,
        })
    }

    pub fn state(&self) -> Vec<u8> {
        self.doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
    }

    pub fn add(&mut self, id: Uuid, member: Member) {
        self.members.insert(id, member);
        self.broadcast(self.presence());
    }

    /// Returns true when the room is now empty.
    pub fn remove(&mut self, id: Uuid) -> bool {
        if self.members.remove(&id).is_some() {
            self.broadcast(self.presence());
        }
        self.members.is_empty()
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
        self.doc
            .transact_mut()
            .apply_update(Update::decode_v1(update)?)?;

        self.dirty = true;
        self.last_editor = Some(author);
        self.relay(from, Message::Binary(Bytes::copy_from_slice(update)));
        Ok(!std::mem::replace(&mut self.flush_scheduled, true))
    }

    pub fn set_cursor(&mut self, id: Uuid, cursor: Cursor) {
        if let Some(member) = self.members.get_mut(&id) {
            member.cursor = Some(cursor);
            self.broadcast(self.presence());
        }
    }

    pub fn set_role(&mut self, id: Uuid, role: Role) {
        if let Some(member) = self.members.get_mut(&id) {
            member.role = role;
            let _ = member.tx.send(text(&ServerMessage::Role { role }));
            self.broadcast(self.presence());
        }
    }

    /// Takes a connection out of the room at once, so it gets no more edits or presence and its
    /// updates are refused, then closes it. Waiting for the client to answer the Close would let
    /// one that ignores it go on editing with the role it had.
    pub fn kick(&mut self, id: Uuid, code: u16) {
        if let Some(member) = self.members.remove(&id) {
            let _ = member.tx.send(close(code, "access changed"));
            self.broadcast(self.presence());
        }
    }

    pub fn close_all(&self, code: u16) {
        self.broadcast(close(code, "song closed"));
    }

    pub fn take_dirty(&mut self) -> Option<Snapshot> {
        self.flush_scheduled = false;
        std::mem::take(&mut self.dirty).then(|| Snapshot {
            state: self.state(),
            updated_by: self.last_editor,
        })
    }

    pub fn connections(&self) -> impl Iterator<Item = (Uuid, i32, Role)> + '_ {
        self.members
            .iter()
            .map(|(id, member)| (*id, member.user_id, member.role))
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

    fn broadcast(&self, message: Message) {
        for member in self.members.values() {
            let _ = member.tx.send(message.clone());
        }
    }

    fn relay(&self, from: Uuid, message: Message) {
        for (id, member) in &self.members {
            if *id != from {
                let _ = member.tx.send(message.clone());
            }
        }
    }
}
