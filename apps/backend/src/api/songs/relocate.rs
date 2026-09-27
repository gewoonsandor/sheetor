use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::song_service;
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
pub struct MoveSong {
    folder_id: Option<Uuid>,
}

#[utoipa::path(
    put,
    path = "/{id}/folder",
    tag = "songs",
    summary = "Moves a song to another folder of the same owner, or to the root",
    params(("id" = Uuid, Path, description = "Song id")),
    request_body = MoveSong,
    responses(
        (status = 204, description = "Song moved"),
        (status = 400, description = "A different owner's library"),
        (status = 403, description = "View-only access"),
        (status = 404, description = "No such song or folder"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<MoveSong>,
) -> Result<StatusCode, LibraryError> {
    song_service::move_to(&state, user.id, id, payload.folder_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
