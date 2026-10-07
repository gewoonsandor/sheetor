use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, State};
use axum::http::HeaderMap;

use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::services::auth_service::{self, AuthSession, Credentials};
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
        (status = 429, description = "Too many attempts for this address or from this client"),
        (status = 503, description = "Too many sign-ins at once"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    mut auth_session: AuthSession,
    Json(creds): Json<Credentials>,
) -> Result<Json<User>, AuthError> {
    if !state.auth.local_enabled {
        return Err(AuthError::LocalDisabled);
    }
    let client = auth_service::client_ip(&headers, peer, state.auth.trust_proxy);
    let user = auth_service::login(&mut auth_session, &state.limits, client, creds).await?;
    Ok(Json(user))
}
