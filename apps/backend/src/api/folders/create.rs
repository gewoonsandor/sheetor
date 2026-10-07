use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::folders::Folder;
use crate::error::library::LibraryError;
use crate::services::folder_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct CreateFolder {
    name: String,
    parent_id: Option<Uuid>,
}

#[utoipa::path(
    post,
    path = "/create",
    tag = "folders",
    summary = "Creates a folder at the root or inside a folder the user may edit",
    request_body = CreateFolder,
    responses(
        (status = 201, description = "Folder created", body = Folder),
        (status = 400, description = "Invalid name, or nested too deep"),
        (status = 403, description = "The parent is view-only"),
        (status = 404, description = "No such parent"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<CreateFolder>,
) -> Result<(StatusCode, Json<Folder>), LibraryError> {
    let folder =
        folder_service::create(&state.db, user.id, &payload.name, payload.parent_id).await?;
    Ok((StatusCode::CREATED, Json(folder)))
}
