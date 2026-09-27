use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::songs::Song;
use crate::error::library::LibraryError;
use crate::services::song_service;
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/{id}/duplicate",
    tag = "songs",
    summary = "Copies a song into the same folder",
    params(("id" = Uuid, Path, description = "Song id")),
    responses(
        (status = 201, description = "The copy", body = Song),
        (status = 403, description = "View-only access"),
        (status = 404, description = "No such song"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<(StatusCode, Json<Song>), LibraryError> {
    let song = song_service::duplicate(&state, user.id, id).await?;
    Ok((StatusCode::CREATED, Json(song)))
}
