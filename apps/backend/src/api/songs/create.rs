use axum::Json;
use axum::body::Bytes;
use axum::extract::{FromRequestParts, Query, State};
use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::http::request::Parts;
use serde::Deserialize;
use utoipa::IntoParams;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::songs::Song;
use crate::error::library::LibraryError;
use crate::services::song_service;
use crate::state::AppState;

#[derive(Deserialize, IntoParams)]
pub struct CreateSong {
    /// The folder to create the song in; the root when absent.
    folder_id: Option<Uuid>,
}

/// Refuses any body but `application/octet-stream`, before the session is even read. A
/// cross-origin page can only post a form or `text/plain` without a CORS preflight, and this
/// server answers no preflight.
pub struct OctetStream;

impl<S: Send + Sync> FromRequestParts<S> for OctetStream {
    type Rejection = LibraryError;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let essence = parts
            .headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next());
        match essence {
            Some(mime) if mime.trim().eq_ignore_ascii_case("application/octet-stream") => Ok(Self),
            _ => Err(LibraryError::UnsupportedMediaType),
        }
    }
}

#[utoipa::path(
    post,
    path = "/create",
    tag = "songs",
    summary = "Creates a song from a Yjs document",
    params(CreateSong),
    request_body(
        content = Vec<u8>,
        content_type = "application/octet-stream",
        description = "A Yjs v1 update whose root map `song` holds the song",
    ),
    responses(
        (status = 201, description = "Song created", body = Song),
        (status = 400, description = "Not a song document"),
        (status = 403, description = "The folder is view-only"),
        (status = 404, description = "No such folder"),
        (status = 415, description = "The body is not application/octet-stream"),
    ),
)]
pub async fn handler(
    _: OctetStream,
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(query): Query<CreateSong>,
    body: Bytes,
) -> Result<(StatusCode, Json<Song>), LibraryError> {
    let song = song_service::create(&state.db, user.id, query.folder_id, &body).await?;
    Ok((StatusCode::CREATED, Json(song)))
}
