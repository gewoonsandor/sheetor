use std::time::Duration;

use sqlx::PgPool;
use uuid::Uuid;

use super::room::Snapshot;
use super::summary::summarize;
use crate::database::queries::songs;
use crate::state::AppState;

// ponytail: edits reach the database 2 s after the first unsaved one (and when the last
// member leaves), so a crash loses at most that window.
const FLUSH_DELAY: Duration = Duration::from_secs(2);

pub fn schedule(state: AppState, song: Uuid) {
    tokio::spawn(async move {
        tokio::time::sleep(FLUSH_DELAY).await;
        if let Some(snapshot) = state.collab.take_dirty(song) {
            persist(&state.db, song, snapshot).await;
        }
    });
}

pub async fn persist(pool: &PgPool, song: Uuid, snapshot: Snapshot) {
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
