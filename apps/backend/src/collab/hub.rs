use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tokio::sync::{Mutex as AsyncMutex, Notify};
use uuid::Uuid;

use super::protocol::{CLOSE_SIGNED_OUT, Cursor};
use super::room::{Member, Room, Snapshot};
use crate::database::schemas::roles::Role;
use crate::error::collab::CollabError;

/// Live connections one user may hold at once, over every song.
pub const MAX_USER_CONNECTIONS: usize = 16;

type Rooms = HashMap<Uuid, Arc<Mutex<Room>>>;

/// Every open song, keyed by song id. Each room has its own lock; the map's is held only to
/// find, open or drop a room, and is taken before a room's, never while holding one. Nothing
/// awaits while holding either.
// ponytail: rooms live in this process's memory, so the backend runs as one instance.
// Fan updates out through Postgres LISTEN/NOTIFY if it ever has to scale out.
#[derive(Clone, Default)]
pub struct Hub {
    rooms: Arc<Mutex<Rooms>>,
    users: Arc<Mutex<HashMap<i32, usize>>>,
    refresh: Arc<Refresh>,
}

#[derive(Default)]
struct Refresh {
    /// Holds at most one request, so any number made during a pass add exactly one more.
    wanted: Notify,
    started: AtomicBool,
}

/// One of a user's live connections, counted until dropped.
pub struct Admission {
    users: Arc<Mutex<HashMap<i32, usize>>>,
    user: i32,
}

impl Drop for Admission {
    fn drop(&mut self) {
        if let Entry::Occupied(mut count) = lock(&self.users).entry(self.user) {
            *count.get_mut() -= 1;
            if *count.get() == 0 {
                count.remove();
            }
        }
    }
}

impl Hub {
    pub fn admit(&self, user: i32) -> Option<Admission> {
        let mut users = lock(&self.users);
        let count = users.entry(user).or_default();
        (*count < MAX_USER_CONNECTIONS).then(|| {
            *count += 1;
            Admission {
                users: self.users.clone(),
                user,
            }
        })
    }

    /// Adds a member and queues the full document for them, opening the room from `stored`
    /// when nobody has the song open.
    pub fn join(
        &self,
        song: Uuid,
        conn: Uuid,
        member: Member,
        stored: &[u8],
    ) -> Result<(), CollabError> {
        // Decoding is the slow part of opening a room, so it happens outside the map's lock.
        let loaded = if self.rooms().contains_key(&song) {
            None
        } else {
            Some(Room::load(stored)?)
        };
        let mut rooms = self.rooms();
        let room = match rooms.entry(song) {
            Entry::Occupied(entry) => entry.get().clone(),
            Entry::Vacant(entry) => {
                let room = match loaded {
                    Some(room) => room,
                    None => Room::load(stored)?,
                };
                entry.insert(Arc::new(Mutex::new(room))).clone()
            }
        };
        // Seated before the map's lock is let go, so `release` cannot drop the room in between.
        let mut seat = lock(&room);
        drop(rooms);
        seat.add(conn, member)
    }

    /// Removes a member and, when they were the last, returns what still needs saving.
    /// The room stays open until `release`, so someone rejoining while that save runs
    /// gets the live document rather than the stale stored one.
    pub fn leave(&self, song: Uuid, conn: Uuid) -> Option<Snapshot> {
        self.with_room(song, |room| room.leave(conn)).flatten()
    }

    pub fn release(&self, song: Uuid) {
        let mut rooms = self.rooms();
        if rooms.get(&song).is_some_and(|room| lock(room).is_idle()) {
            rooms.remove(&song);
        }
    }

    pub fn apply(&self, song: Uuid, conn: Uuid, update: &[u8]) -> Result<bool, CollabError> {
        self.with_room(song, |room| room.apply(conn, update))
            .unwrap_or(Ok(false))
    }

    /// Returns how long until `flush_presence` when the move was held back.
    pub fn set_cursor(&self, song: Uuid, conn: Uuid, cursor: Cursor) -> Option<Duration> {
        self.with_room(song, |room| room.set_cursor(conn, cursor))
            .flatten()
    }

    pub fn flush_presence(&self, song: Uuid) {
        self.with_room(song, Room::flush_presence);
    }

    pub fn set_role(&self, song: Uuid, conn: Uuid, role: Role) {
        self.with_room(song, |room| room.set_role(conn, role));
    }

    /// Applies `user`'s current role (`None`: no access) to all their connections to `song`.
    pub fn set_access(&self, song: Uuid, user: i32, role: Option<Role>) {
        self.with_room(song, |room| room.set_access(user, role));
    }

    /// Takes one connection out of the room and closes it; its session's `leave` then finds it gone.
    pub fn kick(&self, song: Uuid, conn: Uuid, code: u16) {
        self.with_room(song, |room| room.kick(conn, code));
    }

    /// Closes every live connection of `user` with a code the client reconnects on: their other
    /// browsers sign in again, and the one that signed out is refused.
    pub fn disconnect_user(&self, user: i32) {
        for (_, room) in self.open_rooms() {
            lock(&room).kick_user(user, CLOSE_SIGNED_OUT);
        }
    }

    pub fn take_dirty(&self, song: Uuid) -> Option<Snapshot> {
        self.with_room(song, Room::take_dirty).flatten()
    }

    pub fn current_state(&self, song: Uuid) -> Option<Vec<u8>> {
        self.with_room(song, |room| room.state())
    }

    /// Held from taking a snapshot until it is written, so one song's saves land in order.
    pub fn save_lock(&self, song: Uuid) -> Option<Arc<AsyncMutex<()>>> {
        self.with_room(song, |room| room.saving())
    }

    /// Runs `take` on the room only if `saving` is still its save lock: a room closed and
    /// opened again since has a lock of its own, and its saves do not wait on this one.
    pub fn snapshot(
        &self,
        song: Uuid,
        saving: &Arc<AsyncMutex<()>>,
        take: impl FnOnce(&mut Room) -> Option<Snapshot>,
    ) -> Option<Snapshot> {
        self.with_room(song, |room| {
            if Arc::ptr_eq(&room.saving(), saving) {
                take(room)
            } else {
                None
            }
        })
        .flatten()
    }

    /// Drops the room without saving (the song is gone) and closes every member.
    pub fn close_room(&self, song: Uuid, code: u16) {
        let room = self.rooms().remove(&song);
        if let Some(room) = room {
            lock(&room).close_all(code);
        }
    }

    /// Every `(song, user)` with a live connection, each once.
    pub fn audience(&self) -> HashSet<(Uuid, i32)> {
        let mut pairs = HashSet::new();
        for (song, room) in self.open_rooms() {
            pairs.extend(lock(&room).user_ids().map(|user| (song, user)));
        }
        pairs
    }

    /// Asks for a revalidation pass. True only the first time: the caller starts the worker.
    pub fn request_refresh(&self) -> bool {
        self.refresh.wanted.notify_one();
        !self.refresh.started.swap(true, Ordering::Relaxed)
    }

    pub async fn refresh_requested(&self) {
        self.refresh.wanted.notified().await;
    }

    fn with_room<T>(&self, song: Uuid, action: impl FnOnce(&mut Room) -> T) -> Option<T> {
        let room = self.room(song)?;
        let mut room = lock(&room);
        Some(action(&mut room))
    }

    fn room(&self, song: Uuid) -> Option<Arc<Mutex<Room>>> {
        self.rooms().get(&song).cloned()
    }

    fn open_rooms(&self) -> Vec<(Uuid, Arc<Mutex<Room>>)> {
        self.rooms()
            .iter()
            .map(|(song, room)| (*song, room.clone()))
            .collect()
    }

    fn rooms(&self) -> MutexGuard<'_, Rooms> {
        lock(&self.rooms)
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
