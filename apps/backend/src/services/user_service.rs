use crate::database::queries::appearance::{find_appearance, upsert_appearance};
use crate::database::queries::users::{insert_user, update_username};
use crate::database::schemas::appearance::Appearance;
use crate::database::schemas::users::User;
use crate::error::users::{AppearanceError, InsertUserError, UpdateUserError};
use crate::helpers::users::password::{check_password_requirements, hash_password};
use crate::services::auth_service::run_argon2;
use sqlx::PgPool;

/// The `username` column's length.
pub const MAX_USERNAME: usize = 64;
/// The `email` column's length.
pub const MAX_EMAIL: usize = 255;

/// Addresses are stored and looked up in this form, so case and stray spaces never make
/// a second account or a failed sign-in.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

pub async fn create(
    pool: &PgPool,
    username: &str,
    email: &str,
    password: &str,
) -> Result<User, InsertUserError> {
    let username = display_name(username).ok_or(InsertUserError::InvalidUsername)?;
    let email = normalize_email(email);
    if !is_valid_email(&email) {
        return Err(InsertUserError::InvalidEmail);
    }
    if !check_password_requirements(password) {
        return Err(InsertUserError::BadPassWord);
    }

    let password = password.to_owned();
    let hashed_password = run_argon2(
        move || hash_password(&password),
        InsertUserError::Busy,
        InsertUserError::HashTaskFailed,
    )
    .await??;

    insert_user(pool, username, &email, &hashed_password).await
}

pub async fn rename(pool: &PgPool, id: i32, username: &str) -> Result<User, UpdateUserError> {
    let username = display_name(username).ok_or(UpdateUserError::InvalidUsername)?;
    Ok(update_username(pool, id, username).await?)
}

pub async fn appearance(pool: &PgPool, id: i32) -> Result<Option<Appearance>, AppearanceError> {
    Ok(find_appearance(pool, id).await?)
}

pub async fn save_appearance(
    pool: &PgPool,
    id: i32,
    appearance: Appearance,
) -> Result<Appearance, AppearanceError> {
    Ok(upsert_appearance(pool, id, appearance).await?)
}

/// The name as stored: trimmed, and 1 to `MAX_USERNAME` characters.
fn display_name(username: &str) -> Option<&str> {
    let username = username.trim();
    (1..=MAX_USERNAME)
        .contains(&username.chars().count())
        .then_some(username)
}

/// One `@` with text on both sides, within the column. Nothing is ever sent to the
/// address, so this only keeps obvious typos and junk out.
fn is_valid_email(email: &str) -> bool {
    email.chars().count() <= MAX_EMAIL
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty() && !domain.is_empty() && !domain.contains('@')
        })
}
