use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::folder_service;
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/{id}",
    tag = "folders",
    summary = "Deletes a folder; its songs and subfolders move to its parent",
    params(("id" = Uuid, Path, description = "Folder id")),
    responses(
        (status = 204, description = "Folder deleted"),
        (status = 403, description = "Only the owner deletes a folder"),
        (status = 404, description = "No such folder"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, LibraryError> {
    folder_service::delete(&state, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
