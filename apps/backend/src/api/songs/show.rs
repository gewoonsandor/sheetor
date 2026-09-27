use axum::Json;
use axum::extract::{Path, State};
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::songs::Song;
use crate::error::library::LibraryError;
use crate::services::song_service;
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/{id}",
    tag = "songs",
    summary = "A song's listing entry and the caller's role on it",
    params(("id" = Uuid, Path, description = "Song id")),
    responses(
        (status = 200, description = "The song", body = Song),
        (status = 404, description = "No such song"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Song>, LibraryError> {
    Ok(Json(song_service::get(&state.db, user.id, id).await?))
}
