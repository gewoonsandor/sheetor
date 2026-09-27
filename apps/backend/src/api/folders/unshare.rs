use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::share_service;
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/{id}/shares/{user_id}",
    tag = "folders",
    summary = "Removes a share; anyone may remove their own (leave the folder)",
    params(
        ("id" = Uuid, Path, description = "Folder id"),
        ("user_id" = i32, Path, description = "The account losing access"),
    ),
    responses(
        (status = 204, description = "Share removed"),
        (status = 403, description = "Only the owner removes other people"),
        (status = 404, description = "No such folder or share"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((id, user_id)): Path<(Uuid, i32)>,
) -> Result<StatusCode, LibraryError> {
    share_service::revoke(&state, user.id, id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
