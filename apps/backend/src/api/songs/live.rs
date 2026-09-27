use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::http::header::ORIGIN;
use axum::response::Response;
use uuid::Uuid;

use crate::api::current_user::CurrentUser;
use crate::collab::session;
use crate::database::schemas::roles::Role;
use crate::error::library::LibraryError;
use crate::services::access_service;
use crate::state::AppState;

const MAX_UPDATE_BYTES: usize = 1 << 20;

/// `GET /songs/{id}/live`: the song's live editing session over a WebSocket.
pub async fn handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Response, LibraryError> {
    // A cross-site page could otherwise open this socket with the visitor's cookie.
    if !same_origin(&headers, &state.public_url) {
        return Err(LibraryError::Forbidden);
    }
    let role = access_service::require_song(&state.db, user.id, id, Role::Viewer).await?;

    Ok(ws
        .max_message_size(MAX_UPDATE_BYTES)
        .on_upgrade(move |socket| session::run(socket, state, id, user, role)))
}

fn same_origin(headers: &HeaderMap, public_url: &str) -> bool {
    headers
        .get(ORIGIN)
        .is_none_or(|origin| origin.as_bytes() == public_url.as_bytes())
}
