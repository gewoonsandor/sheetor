use super::protocol::CLOSE_REVOKED;
use crate::database::queries::songs;
use crate::state::AppState;

/// Re-checks live connections after an access change, off the request path.
pub fn refresh(state: &AppState) {
    tokio::spawn(revalidate(state.clone()));
}

/// Tells every live connection whose role changed, and closes the ones that lost access.
pub async fn revalidate(state: AppState) {
    for (song, conn, user, role) in state.collab.connections() {
        match songs::song_role(&state.db, user, song).await {
            Ok(Some(Some(now))) if now == role => {}
            Ok(Some(Some(now))) => state.collab.set_role(song, conn, now),
            Ok(_) => state.collab.kick(song, conn, CLOSE_REVOKED),
            Err(error) => tracing::error!(?error, "revalidating live access failed"),
        }
    }
}
