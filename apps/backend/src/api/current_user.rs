use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::database::schemas::users::User;
use crate::error::library::LibraryError;
use crate::services::auth_service::AuthSession;

/// The signed-in user; a request without a session is rejected with 401.
pub struct CurrentUser(pub User);

impl<S: Send + Sync> FromRequestParts<S> for CurrentUser {
    type Rejection = LibraryError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = AuthSession::from_request_parts(parts, state)
            .await
            .map_err(|_| LibraryError::Unauthenticated)?;
        session
            .user
            .map(CurrentUser)
            .ok_or(LibraryError::Unauthenticated)
    }
}
