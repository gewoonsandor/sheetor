use std::collections::BTreeMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use sqlx::PgPool;
use uuid::Uuid;

use crate::collab::access;
use crate::database::queries::{shares, users};
use crate::database::schemas::roles::Role;
use crate::database::schemas::shares::Share;
use crate::error::library::LibraryError;
use crate::services::access_service::require_folder;
use crate::state::AppState;

/// Grants one owner may attempt per window. Unknown addresses count too, so the limit also
/// slows down probing which addresses have an account.
pub const GRANTS_PER_WINDOW: u32 = 30;
const WINDOW: Duration = Duration::from_secs(10 * 60);

// ponytail: per process, like the collab hub; keep the counts in the database once the
// backend runs as more than one instance.
static GRANTS: Mutex<BTreeMap<i32, (Instant, u32)>> = Mutex::new(BTreeMap::new());

pub async fn list(
    pool: &PgPool,
    user_id: i32,
    folder_id: Uuid,
) -> Result<Vec<Share>, LibraryError> {
    require_folder(pool, user_id, folder_id, Role::Owner).await?;
    Ok(shares::list_shares(pool, folder_id).await?)
}

/// Adds or changes a share; granting again with another role is how a role changes.
pub async fn grant(
    state: &AppState,
    user_id: i32,
    folder_id: Uuid,
    email: &str,
    role: Role,
) -> Result<Share, LibraryError> {
    require_folder(&state.db, user_id, folder_id, Role::Owner).await?;
    if role == Role::Owner {
        return Err(LibraryError::OwnerRole);
    }
    count_grant(user_id)?;
    let email = email.trim().to_lowercase();
    let target = users::find_user_by_email(&state.db, &email)
        .await?
        .ok_or(LibraryError::UnknownUser)?;
    if target.id == user_id {
        return Err(LibraryError::ShareWithSelf);
    }
    let share = shares::upsert_share(&state.db, folder_id, target.id, role).await?;

    access::refresh(state);
    Ok(share)
}

/// The owner removes anyone; anyone else may only remove themselves (leave).
pub async fn revoke(
    state: &AppState,
    user_id: i32,
    folder_id: Uuid,
    target_user_id: i32,
) -> Result<(), LibraryError> {
    if target_user_id != user_id {
        require_folder(&state.db, user_id, folder_id, Role::Owner).await?;
    }
    if !shares::delete_share(&state.db, folder_id, target_user_id).await? {
        return Err(LibraryError::NotFound);
    }

    access::refresh(state);
    Ok(())
}

/// Counts one grant against `user_id`'s current window, which opens with their first grant.
fn count_grant(user_id: i32) -> Result<(), LibraryError> {
    let now = Instant::now();
    let mut grants = GRANTS.lock().unwrap_or_else(PoisonError::into_inner);
    grants.retain(|_, (opened, _)| now.duration_since(*opened) < WINDOW);
    let (_, count) = grants.entry(user_id).or_insert((now, 0));
    if *count >= GRANTS_PER_WINDOW {
        return Err(LibraryError::TooManyShares);
    }
    *count += 1;
    Ok(())
}
