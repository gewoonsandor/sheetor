use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::folders::Folder;
use crate::error::library::LibraryError;
use crate::services::folder_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct RenameFolder {
    name: String,
}

#[utoipa::path(
    put,
    path = "/{id}/name",
    tag = "folders",
    summary = "Renames a folder",
    params(("id" = Uuid, Path, description = "Folder id")),
    request_body = RenameFolder,
    responses(
        (status = 200, description = "Folder renamed", body = Folder),
        (status = 400, description = "Invalid name"),
        (status = 403, description = "View-only access"),
        (status = 404, description = "No such folder"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<RenameFolder>,
) -> Result<Json<Folder>, LibraryError> {
    let folder = folder_service::rename(&state.db, user.id, id, &payload.name).await?;
    Ok(Json(folder))
}
