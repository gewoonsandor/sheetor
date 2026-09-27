use sqlx::PgPool;
use uuid::Uuid;

use crate::database::queries::{folders, songs};
use crate::database::schemas::roles::Role;
use crate::error::library::LibraryError;

pub async fn require_folder(
    pool: &PgPool,
    user_id: i32,
    folder_id: Uuid,
    need: Role,
) -> Result<Role, LibraryError> {
    check(folders::folder_role(pool, user_id, folder_id).await?, need)
}

pub async fn require_song(
    pool: &PgPool,
    user_id: i32,
    song_id: Uuid,
    need: Role,
) -> Result<Role, LibraryError> {
    check(
        songs::song_role(pool, user_id, song_id).await?.flatten(),
        need,
    )
}

/// Whose library an item placed under `parent` belongs to: the caller's own at the
/// root, otherwise the owner of a folder the caller may edit.
pub async fn target_owner(
    pool: &PgPool,
    user_id: i32,
    parent: Option<Uuid>,
) -> Result<i32, LibraryError> {
    let Some(parent) = parent else {
        return Ok(user_id);
    };
    require_folder(pool, user_id, parent, Role::Editor).await?;
    let folder = folders::find_folder(pool, parent).await?;
    Ok(folder.ok_or(LibraryError::NotFound)?.owner_id)
}

/// Anything the user cannot see at all is reported as missing, not forbidden.
fn check(role: Option<Role>, need: Role) -> Result<Role, LibraryError> {
    match role {
        None => Err(LibraryError::NotFound),
        Some(role) if role < need => Err(LibraryError::Forbidden),
        Some(role) => Ok(role),
    }
}
