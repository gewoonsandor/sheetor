use axum::Json;
use axum::extract::{Path, State};
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::shares::Share;
use crate::error::library::LibraryError;
use crate::services::share_service;
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/{id}/shares",
    tag = "folders",
    summary = "Who the folder is shared with",
    params(("id" = Uuid, Path, description = "Folder id")),
    responses(
        (status = 200, description = "The folder's shares", body = Vec<Share>),
        (status = 403, description = "Only the owner sees shares"),
        (status = 404, description = "No such folder"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<Share>>, LibraryError> {
    Ok(Json(share_service::list(&state.db, user.id, id).await?))
}
