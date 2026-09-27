use axum::Json;
use axum::extract::State;
use axum_login::Error as AuthSessionError;

use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::services::auth_service::{AuthSession, Credentials};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/login",
    tag = "users",
    summary = "Logs a user in and issues a session cookie",
    request_body = Credentials,
    responses(
        (status = 200, description = "Logged in", body = User),
        (status = 401, description = "Invalid email or password"),
        (status = 403, description = "Email and password sign-in is disabled"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    Json(creds): Json<Credentials>,
) -> Result<Json<User>, AuthError> {
    if !state.auth.local_enabled {
        return Err(AuthError::LocalDisabled);
    }
    let user = auth_session
        .authenticate(creds)
        .await
        .map_err(unwrap_session_error)?
        .ok_or(AuthError::InvalidCredentials)?;

    auth_session
        .login(&user)
        .await
        .map_err(unwrap_session_error)?;

    Ok(Json(user))
}

fn unwrap_session_error(
    error: AuthSessionError<crate::services::auth_service::Backend>,
) -> AuthError {
    match error {
        AuthSessionError::Backend(error) => error,
        AuthSessionError::Session(error) => {
            tracing::error!(error = ?error, "session store failure");
            AuthError::Session
        }
    }
}
