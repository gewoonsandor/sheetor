use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::database::schemas::users::User;
use crate::error::users::InsertUserError;
use crate::services::user_service;
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
        (status = 400, description = "Password does not meet requirements"),
        (status = 403, description = "Email and password sign-in is disabled"),
        (status = 409, description = "Email already registered"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    Json(payload): Json<CreatePayload>,
) -> Result<(StatusCode, Json<User>), InsertUserError> {
    if !state.auth.local_enabled {
        return Err(InsertUserError::LocalDisabled);
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
