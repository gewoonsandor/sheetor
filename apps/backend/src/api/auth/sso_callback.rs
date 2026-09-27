use axum::extract::{Query, State};
use axum::response::Redirect;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::error::sso::SsoError;
use crate::services::auth_service::AuthSession;
use crate::services::sso_service::{self, PENDING_KEY, PendingLogin};
use crate::state::AppState;

#[derive(Deserialize, IntoParams)]
pub struct Callback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/sso/callback",
    tag = "auth",
    summary = "Where the identity provider returns; signs the user in",
    params(Callback),
    responses((
        status = 303,
        description = "To the app, or to the sign-in page with `sso_error`",
    )),
)]
pub async fn handler(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(callback): Query<Callback>,
) -> Redirect {
    match sign_in(&state, auth_session, callback).await {
        Ok(()) => Redirect::to("/"),
        Err(error) => {
            tracing::warn!(?error, "sso login failed");
            Redirect::to(&format!("/?sso_error={}", error.code()))
        }
    }
}

async fn sign_in(
    state: &AppState,
    mut auth_session: AuthSession,
    callback: Callback,
) -> Result<(), SsoError> {
    let sso = state.auth.sso.as_ref().ok_or(SsoError::NotConfigured)?;
    let pending: PendingLogin = auth_session
        .session
        .remove(PENDING_KEY)
        .await
        .map_err(|_| SsoError::Session)?
        .ok_or(SsoError::MissingPending)?;
    if let Some(error) = callback.error {
        return Err(SsoError::Exchange(error));
    }
    let (Some(code), Some(csrf)) = (callback.code, callback.state) else {
        return Err(SsoError::Exchange("missing code or state".to_owned()));
    };

    let identity = sso_service::complete(sso, pending, code, csrf).await?;
    let user = sso_service::resolve_user(&state.db, identity).await?;
    auth_session
        .login(&user)
        .await
        .map_err(|_| SsoError::Session)
}
