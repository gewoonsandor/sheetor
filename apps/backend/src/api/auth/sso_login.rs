use axum::extract::State;
use axum::response::Redirect;
use tower_sessions::Expiry;
use tower_sessions::cookie::time::Duration;

use crate::error::sso::SsoError;
use crate::services::auth_service::AuthSession;
use crate::services::sso_service::{self, PENDING_KEY};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/sso/login",
    tag = "auth",
    summary = "Starts single sign-on by redirecting to the identity provider",
    responses(
        (status = 303, description = "Redirect to the identity provider"),
        (status = 404, description = "Single sign-on is not configured"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> Result<Redirect, SsoError> {
    let sso = state.auth.sso.as_ref().ok_or(SsoError::NotConfigured)?;
    let (url, pending) = sso_service::begin(sso).await.inspect_err(|error| {
        tracing::warn!(?error, "sso login could not start");
    })?;
    // Every visit writes a session row; an abandoned sign-in should not keep it for the
    // default two weeks. The callback restores the default once someone signs in.
    auth_session
        .session
        .set_expiry(Some(Expiry::OnInactivity(Duration::minutes(10))));
    auth_session
        .session
        .insert(PENDING_KEY, pending)
        .await
        .map_err(|_| SsoError::Session)?;

    Ok(Redirect::to(&url))
}
