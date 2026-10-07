use sqlx::PgPool;
use uuid::Uuid;

use crate::collab::access;
use crate::database::queries::folders;
use crate::database::schemas::folders::{Folder, FolderRecord};
use crate::database::schemas::roles::Role;
use crate::error::library::LibraryError;
use crate::services::access_service::{require_folder, target_owner};
use crate::state::AppState;

const MAX_NAME: usize = 120;
/// Keeps every walk up or down a library short; `LibraryError::TooDeep`'s message repeats it.
pub const MAX_DEPTH: i64 = 32;

pub async fn create(
    pool: &PgPool,
    user_id: i32,
    name: &str,
    parent: Option<Uuid>,
) -> Result<Folder, LibraryError> {
    let name = clean_name(name)?;
    let owner = target_owner(pool, user_id, parent).await?;

    let mut tx = pool.begin().await?;
    folders::lock_library(&mut tx, owner).await?;
    if let Some(parent) = parent
        && folders::depth_under(&mut tx, parent, None).await? > MAX_DEPTH
    {
        return Err(LibraryError::TooDeep);
    }
    let id = folders::insert_folder(&mut tx, owner, parent, &name).await?;
    tx.commit().await?;

    view(pool, id, user_id).await
}

pub async fn rename(
    pool: &PgPool,
    user_id: i32,
    id: Uuid,
    name: &str,
) -> Result<Folder, LibraryError> {
    let name = clean_name(name)?;
    require_folder(pool, user_id, id, Role::Editor).await?;
    folders::rename_folder(pool, id, &name).await?;
    view(pool, id, user_id).await
}

pub async fn move_to(
    state: &AppState,
    user_id: i32,
    id: Uuid,
    parent: Option<Uuid>,
) -> Result<(), LibraryError> {
    require_folder(&state.db, user_id, id, Role::Editor).await?;
    let folder = find(&state.db, id).await?;
    if target_owner(&state.db, user_id, parent).await? != folder.owner_id {
        return Err(LibraryError::CrossOwner);
    }

    let mut tx = state.db.begin().await?;
    folders::lock_library(&mut tx, folder.owner_id).await?;
    if let Some(parent) = parent {
        if folders::is_descendant(&mut tx, parent, id).await? {
            return Err(LibraryError::Cycle);
        }
        if folders::depth_under(&mut tx, parent, Some(id)).await? > MAX_DEPTH {
            return Err(LibraryError::TooDeep);
        }
    }
    folders::set_folder_parent(&mut tx, id, parent).await?;
    tx.commit().await?;

    access::refresh(state);
    Ok(())
}

/// Only the owner deletes a folder; its songs and subfolders move up one level.
pub async fn delete(state: &AppState, user_id: i32, id: Uuid) -> Result<(), LibraryError> {
    require_folder(&state.db, user_id, id, Role::Owner).await?;
    let folder = find(&state.db, id).await?;

    let mut tx = state.db.begin().await?;
    folders::lock_library(&mut tx, folder.owner_id).await?;
    folders::delete_folder(&mut tx, id).await?;
    tx.commit().await?;

    access::refresh(state);
    Ok(())
}

async fn find(pool: &PgPool, id: Uuid) -> Result<FolderRecord, LibraryError> {
    folders::find_folder(pool, id)
        .await?
        .ok_or(LibraryError::NotFound)
}

async fn view(pool: &PgPool, id: Uuid, user_id: i32) -> Result<Folder, LibraryError> {
    folders::folder_view(pool, id, user_id)
        .await?
        .ok_or(LibraryError::NotFound)
}

fn clean_name(name: &str) -> Result<String, LibraryError> {
    let name = name.trim();
    match name.chars().count() {
        1..=MAX_NAME => Ok(name.to_owned()),
        _ => Err(LibraryError::InvalidName),
    }
}
