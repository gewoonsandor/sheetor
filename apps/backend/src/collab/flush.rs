use std::time::Duration;

use sqlx::PgPool;
use uuid::Uuid;

use super::room::{Room, Snapshot};
use super::summary::summarize;
use crate::database::queries::songs;
use crate::state::AppState;

// ponytail: edits reach the database 2 s after the first unsaved one (and when the last
// member leaves), so a crash loses at most that window.
const FLUSH_DELAY: Duration = Duration::from_secs(2);

pub fn schedule(state: AppState, song: Uuid) {
    tokio::spawn(async move {
        tokio::time::sleep(FLUSH_DELAY).await;
        save(&state, song, Room::take_dirty).await;
    });
}

/// Writes the snapshot `take` hands over. One song's saves run one at a time, each taking its
/// snapshot only once the one before is written, so an older state never lands after a newer.
pub async fn save(state: &AppState, song: Uuid, take: impl FnOnce(&mut Room) -> Option<Snapshot>) {
    let Some(saving) = state.collab.save_lock(song) else {
        return;
    };
    let _turn = saving.lock().await;
    if let Some(snapshot) = state.collab.snapshot(song, &saving, take) {
        persist(&state.db, song, snapshot).await;
    }
}

async fn persist(pool: &PgPool, song: Uuid, snapshot: Snapshot) {
    let summary = match summarize(&snapshot.state) {
        Ok(summary) => summary,
        Err(error) => {
            tracing::error!(%song, ?error, "unreadable song state, not saved");
            return;
        }
    };
    let saved = songs::save_state(pool, song, &snapshot.state, &summary, snapshot.updated_by);
    if let Err(error) = saved.await {
        tracing::error!(%song, ?error, "saving song state failed");
    }
}
