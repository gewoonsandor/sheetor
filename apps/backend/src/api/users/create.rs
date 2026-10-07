use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use utoipa::ToSchema;

use crate::database::schemas::users::User;
use crate::error::users::InsertUserError;
use crate::services::{auth_service, user_service};
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct CreatePayload {
    username: String,
    email: String,
    password: String,
}

#[utoipa::path(
    post,
    path = "/create",
    tag = "users",
    summary = "Creates a new user",
    request_body = CreatePayload,
    responses(
        (status = 201, description = "User created", body = User),
        (status = 400, description = "Invalid display name, email or password"),
        (status = 403, description = "Email and password sign-in is disabled"),
        (status = 409, description = "Email already registered"),
        (status = 429, description = "Too many sign-ups from this client"),
        (status = 503, description = "Too many sign-ups at once"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CreatePayload>,
) -> Result<(StatusCode, Json<User>), InsertUserError> {
    if !state.auth.local_enabled {
        return Err(InsertUserError::LocalDisabled);
    }
    let client = auth_service::client_ip(&headers, peer, state.auth.trust_proxy);
    if !state.limits.signup_by_ip.attempt(client) {
        return Err(InsertUserError::TooManyAttempts);
    }
    let user = user_service::create(
        &state.db,
        &payload.username,
        &payload.email,
        &payload.password,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(user)))
}
