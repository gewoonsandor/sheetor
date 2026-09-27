use sqlx::PgPool;
use uuid::Uuid;

use crate::collab::access;
use crate::collab::protocol::CLOSE_GONE;
use crate::collab::summary::{retitle, summarize};
use crate::database::queries::songs::{self, NewSong};
use crate::database::schemas::roles::Role;
use crate::database::schemas::songs::{Song, SongRecord};
use crate::error::library::LibraryError;
use crate::services::access_service::{require_song, target_owner};
use crate::state::AppState;

pub async fn create(
    pool: &PgPool,
    user_id: i32,
    folder: Option<Uuid>,
    state: &[u8],
) -> Result<Song, LibraryError> {
    let owner = target_owner(pool, user_id, folder).await?;
    insert(pool, owner, folder, state, user_id).await
}

pub async fn get(pool: &PgPool, user_id: i32, id: Uuid) -> Result<Song, LibraryError> {
    require_song(pool, user_id, id, Role::Viewer).await?;
    view(pool, id, user_id).await
}

/// Copies the live document when the song is open, so unsaved edits come along.
pub async fn duplicate(state: &AppState, user_id: i32, id: Uuid) -> Result<Song, LibraryError> {
    require_song(&state.db, user_id, id, Role::Editor).await?;
    let song = find(&state.db, id).await?;
    let bytes = match state.collab.current_state(id) {
        Some(bytes) => bytes,
        None => songs::load_state(&state.db, id)
            .await?
            .ok_or(LibraryError::NotFound)?,
    };
    let title = summarize(&bytes)?.title;
    let copy = retitle(&bytes, &format!("{title} (copy)"))?;

    insert(&state.db, song.owner_id, song.folder_id, &copy, user_id).await
}

pub async fn move_to(
    state: &AppState,
    user_id: i32,
    id: Uuid,
    folder: Option<Uuid>,
) -> Result<(), LibraryError> {
    require_song(&state.db, user_id, id, Role::Editor).await?;
    let song = find(&state.db, id).await?;
    if target_owner(&state.db, user_id, folder).await? != song.owner_id {
        return Err(LibraryError::CrossOwner);
    }
    songs::set_song_folder(&state.db, id, folder).await?;

    access::refresh(state);
    Ok(())
}

pub async fn delete(state: &AppState, user_id: i32, id: Uuid) -> Result<(), LibraryError> {
    require_song(&state.db, user_id, id, Role::Editor).await?;
    songs::delete_song(&state.db, id).await?;
    state.collab.close_room(id, CLOSE_GONE);
    Ok(())
}

async fn insert(
    pool: &PgPool,
    owner_id: i32,
    folder_id: Option<Uuid>,
    state: &[u8],
    user_id: i32,
) -> Result<Song, LibraryError> {
    let summary = summarize(state)?;
    let song = NewSong {
        owner_id,
        folder_id,
        summary: &summary,
        state,
        created_by: user_id,
    };
    let id = songs::insert_song(pool, song).await?;
    view(pool, id, user_id).await
}

async fn find(pool: &PgPool, id: Uuid) -> Result<SongRecord, LibraryError> {
    songs::find_song(pool, id)
        .await?
        .ok_or(LibraryError::NotFound)
}

async fn view(pool: &PgPool, id: Uuid, user_id: i32) -> Result<Song, LibraryError> {
    songs::song_view(pool, id, user_id)
        .await?
        .ok_or(LibraryError::NotFound)
}
