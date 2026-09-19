use axum::http::StatusCode;

use crate::error::auth::AuthError;
use crate::services::auth_service::AuthSession;

#[utoipa::path(
    post,
    path = "/logout",
    tag = "users",
    summary = "Clears the session",
    responses((status = 204, description = "Session cleared")),
)]
pub async fn handler(mut auth_session: AuthSession) -> Result<StatusCode, AuthError> {
    auth_session.logout().await.map_err(|error| {
        tracing::error!(error = ?error, "logout failed");
        AuthError::Session
    })?;

    Ok(StatusCode::NO_CONTENT)
}
