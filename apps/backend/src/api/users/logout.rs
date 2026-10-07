use axum::extract::State;
use axum::http::StatusCode;

use crate::error::auth::AuthError;
use crate::services::auth_service::AuthSession;
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/logout",
    tag = "users",
    summary = "Clears the session",
    responses((status = 204, description = "Session cleared")),
)]
pub async fn handler(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
) -> Result<StatusCode, AuthError> {
    let user = auth_session.logout().await.map_err(|error| {
        tracing::error!(error = ?error, "logout failed");
        AuthError::Session
    })?;

    // A live socket is authenticated once, at upgrade. Closed, each reconnects and signs in
    // again, which only this browser's now fail to.
    if let Some(user) = user {
        state.collab.disconnect_user(user.id);
    }
    Ok(StatusCode::NO_CONTENT)
}
