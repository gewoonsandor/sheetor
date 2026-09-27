use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::folder_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct MoveFolder {
    parent_id: Option<Uuid>,
}

#[utoipa::path(
    put,
    path = "/{id}/parent",
    tag = "folders",
    summary = "Moves a folder under another folder of the same owner, or to the root",
    params(("id" = Uuid, Path, description = "Folder id")),
    request_body = MoveFolder,
    responses(
        (status = 204, description = "Folder moved"),
        (status = 400, description = "Cycle or a different owner's library"),
        (status = 403, description = "View-only access"),
        (status = 404, description = "No such folder"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<MoveFolder>,
) -> Result<StatusCode, LibraryError> {
    folder_service::move_to(&state, user.id, id, payload.parent_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
