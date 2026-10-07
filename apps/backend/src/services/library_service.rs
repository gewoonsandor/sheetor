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

/// A pathological tree costs a 500, not a connection held for as long as the walk takes.
const LIST_TIMEOUT: &str = "5s";

pub async fn list(pool: &PgPool, user_id: i32) -> Result<Library, LibraryError> {
    let mut tx = pool.begin().await?;
    folders::set_statement_timeout(&mut tx, LIST_TIMEOUT).await?;
    let folders = folders::accessible_folders(&mut tx, user_id).await?;
    let shared: Vec<Uuid> = folders
        .iter()
        .filter(|folder| folder.role != Role::Owner)
        .map(|folder| folder.id)
        .collect();
    let songs = songs::accessible_songs(&mut tx, user_id, &shared).await?;
    tx.commit().await?;

    Ok(Library { folders, songs })
}
