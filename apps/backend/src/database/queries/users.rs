use sqlx::PgPool;

use crate::database::schemas::users::User;
use crate::error::sso::SsoError;
use crate::error::users;

pub async fn insert_user(
    pool: &PgPool,
    username: &str,
    email: &str,
    password: &str,
) -> Result<User, users::InsertUserError> {
    sqlx::query_as!(
        User,
        "INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, password_hash, provider, provider_id",
        username,
        email,
        password,
    )
    .fetch_one(pool)
    .await
    .map_err(classify_insert_error)
}

pub async fn find_user_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash, provider, provider_id
         FROM users
         WHERE email = $1",
        email,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_user_by_id(pool: &PgPool, id: i32) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash, provider, provider_id
         FROM users
         WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_user_by_identity(
    pool: &PgPool,
    provider: &str,
    subject: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        "SELECT id, username, email, password_hash, provider, provider_id
         FROM users
         WHERE provider = $1 AND provider_id = $2",
        provider,
        subject,
    )
    .fetch_optional(pool)
    .await
}

/// Attaches an identity to the account with that address, unless it already has one, and drops
/// its password. Nobody confirmed the address when that password was set, so it may be a
/// squatter's: keeping it would let them sign in to the account the real owner now uses.
/// Clearing it also ends every session the password opened (`session_auth_hash`).
pub async fn link_identity(
    pool: &PgPool,
    email: &str,
    provider: &str,
    subject: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        "UPDATE users SET provider = $2, provider_id = $3, password_hash = NULL
         WHERE email = $1 AND provider_id IS NULL
         RETURNING id, username, email, password_hash, provider, provider_id",
        email,
        provider,
        subject,
    )
    .fetch_optional(pool)
    .await
}

/// Creates a password-less account for an identity. Two racing first sign-ins of the same
/// identity both get the one row, through the no-op update on conflict.
pub async fn insert_sso_user(
    pool: &PgPool,
    username: &str,
    email: &str,
    provider: &str,
    subject: &str,
) -> Result<User, SsoError> {
    sqlx::query_as!(
        User,
        "INSERT INTO users (username, email, provider, provider_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_id) DO UPDATE SET provider_id = EXCLUDED.provider_id
         RETURNING id, username, email, password_hash, provider, provider_id",
        username,
        email,
        provider,
        subject,
    )
    .fetch_one(pool)
    .await
    .map_err(classify_sso_insert_error)
}

pub async fn update_username(pool: &PgPool, id: i32, username: &str) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        "UPDATE users SET username = $2
         WHERE id = $1
         RETURNING id, username, email, password_hash, provider, provider_id",
        id,
        username,
    )
    .fetch_one(pool)
    .await
}

/// Moves every identity of one provider to another name; returns how many moved.
pub async fn rename_provider(pool: &PgPool, from: &str, to: &str) -> Result<u64, sqlx::Error> {
    let done = sqlx::query!(
        "UPDATE users SET provider = $2 WHERE provider = $1",
        from,
        to,
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

/// `users_email_key` on the address itself, `users_email_lower_key` on `lower(email)`.
fn is_email_taken(db: &(dyn sqlx::error::DatabaseError + 'static)) -> bool {
    db.is_unique_violation()
        && matches!(
            db.constraint(),
            Some("users_email_key" | "users_email_lower_key")
        )
}

fn classify_sso_insert_error(error: sqlx::Error) -> SsoError {
    let taken = error.as_database_error().is_some_and(is_email_taken);
    if taken {
        SsoError::EmailTaken
    } else {
        SsoError::Database(error)
    }
}

fn classify_insert_error(error: sqlx::Error) -> users::InsertUserError {
    if error.as_database_error().is_some_and(is_email_taken) {
        return users::InsertUserError::EmailTaken;
    }
    tracing::error!(error = ?error, "db error inserting user");
    users::InsertUserError::Database(error)
}
