use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::roles::Role;
use crate::database::schemas::shares::Share;
use crate::error::library::LibraryError;
use crate::services::share_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct ShareFolder {
    email: String,
    role: Role,
}

#[utoipa::path(
    put,
    path = "/{id}/shares",
    tag = "folders",
    summary = "Shares the folder with an account, or changes that account's role",
    params(("id" = Uuid, Path, description = "Folder id")),
    request_body = ShareFolder,
    responses(
        (status = 200, description = "The saved share", body = Share),
        (status = 400, description = "Owner role or sharing with yourself"),
        (status = 403, description = "Only the owner shares"),
        (status = 404, description = "No such folder or account"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<ShareFolder>,
) -> Result<Json<Share>, LibraryError> {
    let share = share_service::grant(&state, user.id, id, &payload.email, payload.role).await?;
    Ok(Json(share))
}
