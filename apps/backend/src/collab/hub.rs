use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use uuid::Uuid;

use super::protocol::Cursor;
use super::room::{Member, Room, Snapshot};
use crate::database::schemas::roles::Role;
use crate::error::collab::CollabError;

/// Every open song, keyed by song id. Nothing here awaits while holding the lock.
// ponytail: rooms live in this process's memory, so the backend runs as one instance.
// Fan updates out through Postgres LISTEN/NOTIFY if it ever has to scale out.
#[derive(Clone, Default)]
pub struct Hub {
    rooms: Arc<Mutex<HashMap<Uuid, Room>>>,
}

impl Hub {
    /// Adds a member, opening the room from `stored` when nobody has the song open,
    /// and returns the full document state to send them.
    pub fn join(
        &self,
        song: Uuid,
        conn: Uuid,
        member: Member,
        stored: &[u8],
    ) -> Result<Vec<u8>, CollabError> {
        let mut rooms = self.rooms();
        let room = match rooms.entry(song) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(Room::load(stored)?),
        };
        room.add(conn, member);
        Ok(room.state())
    }

    /// Removes a member and, when they were the last, returns what still needs saving.
    /// The room stays open until `release`, so someone rejoining while that save runs
    /// gets the live document rather than the stale stored one.
    pub fn leave(&self, song: Uuid, conn: Uuid) -> Option<Snapshot> {
        self.with_room(song, |room| {
            if room.remove(conn) {
                room.take_dirty()
            } else {
                None
            }
        })
        .flatten()
    }

    pub fn release(&self, song: Uuid) {
        let mut rooms = self.rooms();
        if rooms.get(&song).is_some_and(Room::is_idle) {
            rooms.remove(&song);
        }
    }

    pub fn apply(&self, song: Uuid, conn: Uuid, update: &[u8]) -> Result<bool, CollabError> {
        self.with_room(song, |room| room.apply(conn, update))
            .unwrap_or(Ok(false))
    }

    pub fn set_cursor(&self, song: Uuid, conn: Uuid, cursor: Cursor) {
        self.with_room(song, |room| room.set_cursor(conn, cursor));
    }

    pub fn set_role(&self, song: Uuid, conn: Uuid, role: Role) {
        self.with_room(song, |room| room.set_role(conn, role));
    }

    /// Asks one connection to close; its session leaves the room when it does.
    pub fn kick(&self, song: Uuid, conn: Uuid, code: u16) {
        self.with_room(song, |room| room.kick(conn, code));
    }

    pub fn take_dirty(&self, song: Uuid) -> Option<Snapshot> {
        self.with_room(song, Room::take_dirty).flatten()
    }

    pub fn current_state(&self, song: Uuid) -> Option<Vec<u8>> {
        self.with_room(song, |room| room.state())
    }

    /// Drops the room without saving (the song is gone) and closes every member.
    pub fn close_room(&self, song: Uuid, code: u16) {
        if let Some(room) = self.rooms().remove(&song) {
            room.close_all(code);
        }
    }

    /// `(song, connection, user, role)` for every live connection.
    pub fn connections(&self) -> Vec<(Uuid, Uuid, i32, Role)> {
        self.rooms()
            .iter()
            .flat_map(|(song, room)| {
                room.connections()
                    .map(move |(conn, user, role)| (*song, conn, user, role))
            })
            .collect()
    }

    fn with_room<T>(&self, song: Uuid, action: impl FnOnce(&mut Room) -> T) -> Option<T> {
        self.rooms().get_mut(&song).map(action)
    }

    fn rooms(&self) -> MutexGuard<'_, HashMap<Uuid, Room>> {
        self.rooms.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
