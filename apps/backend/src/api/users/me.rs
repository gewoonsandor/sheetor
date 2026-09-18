use axum::Json;

use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::services::auth_service::AuthSession;

#[utoipa::path(
    get,
    path = "/me",
    tag = "users",
    summary = "The signed-in user",
    responses(
        (status = 200, description = "The signed-in user", body = User),
        (status = 401, description = "No session"),
    ),
)]
pub async fn handler(auth_session: AuthSession) -> Result<Json<User>, AuthError> {
    // `login_required!` has already rejected an anonymous request, so the
    // `None` arm is unreachable in practice - it exists so the guard is not
    // the only thing standing between an anonymous caller and a panic.
    auth_session
        .user
        .map(Json)
        .ok_or(AuthError::InvalidCredentials)
}
