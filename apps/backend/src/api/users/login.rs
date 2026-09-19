use axum::Json;
use axum_login::Error as AuthSessionError;

use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::services::auth_service::{AuthSession, Credentials};

#[utoipa::path(
    post,
    path = "/login",
    tag = "users",
    summary = "Logs a user in and issues a session cookie",
    request_body = Credentials,
    responses(
        (status = 200, description = "Logged in", body = User),
        (status = 401, description = "Invalid email or password"),
    ),
)]
pub async fn handler(
    mut auth_session: AuthSession,
    Json(creds): Json<Credentials>,
) -> Result<Json<User>, AuthError> {
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
