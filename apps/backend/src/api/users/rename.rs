use axum::Json;
use axum::extract::State;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::users::User;
use crate::error::users::UpdateUserError;
use crate::services::user_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct RenamePayload {
    username: String,
}

#[utoipa::path(
    put,
    path = "/me/name",
    tag = "users",
    summary = "Changes the signed-in user's display name",
    request_body = RenamePayload,
    responses(
        (status = 200, description = "Renamed", body = User),
        (status = 400, description = "Invalid display name"),
        (status = 401, description = "No session"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<RenamePayload>,
) -> Result<Json<User>, UpdateUserError> {
    let user = user_service::rename(&state.db, user.id, &payload.username).await?;
    Ok(Json(user))
}
