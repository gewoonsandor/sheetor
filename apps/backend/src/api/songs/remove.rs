use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::song_service;
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/{id}",
    tag = "songs",
    summary = "Deletes a song and closes its live session",
    params(("id" = Uuid, Path, description = "Song id")),
    responses(
        (status = 204, description = "Song deleted"),
        (status = 403, description = "View-only access"),
        (status = 404, description = "No such song"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, LibraryError> {
    song_service::delete(&state, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
