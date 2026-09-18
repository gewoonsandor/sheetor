use sqlx::PgPool;

use crate::database::schemas::users::User;
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

fn classify_insert_error(error: sqlx::Error) -> users::InsertUserError {
    let taken = error.as_database_error().and_then(|db| {
        if !db.is_unique_violation() {
            return None;
        }
        match db.constraint() {
            Some("users_email_key") => Some(users::InsertUserError::EmailTaken),
            _ => None,
        }
    });

    taken.unwrap_or_else(|| {
        tracing::error!(error = ?error, "db error inserting user");
        users::InsertUserError::Database(error)
    })
}
