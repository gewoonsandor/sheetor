use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::database::queries::{folders, songs};
use crate::database::schemas::folders::Folder;
use crate::database::schemas::roles::Role;
use crate::database::schemas::songs::Song;
use crate::error::library::LibraryError;

#[derive(Serialize, ToSchema)]
pub struct Library {
    pub folders: Vec<Folder>,
    pub songs: Vec<Song>,
}

pub async fn list(pool: &PgPool, user_id: i32) -> Result<Library, LibraryError> {
    let folders = folders::accessible_folders(pool, user_id).await?;
    let shared: Vec<Uuid> = folders
        .iter()
        .filter(|folder| folder.role != Role::Owner)
        .map(|folder| folder.id)
        .collect();
    let songs = songs::accessible_songs(pool, user_id, &shared).await?;

    Ok(Library { folders, songs })
}
