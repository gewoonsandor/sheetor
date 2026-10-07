use super::protocol::CLOSE_GONE;
use crate::database::queries::songs;
use crate::state::AppState;

/// Re-checks live connections after an access change, off the request path. One worker runs
/// every pass, so results land in the order they were read, and calls made during a pass
/// queue exactly one more.
pub fn refresh(state: &AppState) {
    if state.collab.request_refresh() {
        tokio::spawn(work(state.clone()));
    }
}

async fn work(state: AppState) {
    loop {
        state.collab.refresh_requested().await;
        revalidate(&state).await;
    }
}

/// Tells every live connection whose role changed, and closes the ones that lost access.
async fn revalidate(state: &AppState) {
    for (song, user) in state.collab.audience() {
        match songs::song_role(&state.db, user, song).await {
            Ok(Some(role)) => state.collab.set_access(song, user, role),
            Ok(None) => state.collab.close_room(song, CLOSE_GONE),
            Err(error) => tracing::error!(?error, "revalidating live access failed"),
        }
    }
}
