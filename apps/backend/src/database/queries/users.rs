use sqlx::PgPool;

use crate::database::schemas::users::{NewUser, User};

/// Why an insert was refused. This layer owns the SQL details - the constraint
/// names below - so the service layer above can talk about a taken address
/// without knowing Postgres exists.
///
/// There is no `UsernameTaken`, because the migration puts `UNIQUE` on `email`
/// only. Add the constraint and the variant together, or a duplicate username
/// falls into `Database` and surfaces as a 500.
#[derive(Debug)]
pub enum InsertUserError {
    EmailTaken,
    Database(sqlx::Error),
}

/// Insert a user, or report which unique column already held the value.
///
/// There is deliberately no "is this email free?" query first. Between that
/// check and the insert another request can take the name, and both callers
/// then believe they won - the classic time-of-check/time-of-use race. The
/// `UNIQUE` constraints are the only thing that can answer atomically, so we
/// attempt the write and let Postgres arbitrate: one round trip instead of
/// two, and correct no matter how many requests arrive at once.
pub async fn insert_user(pool: &PgPool, new: NewUser<'_>) -> Result<User, InsertUserError> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, password_hash, provider, provider_id",
    )
    .bind(new.username)
    .bind(new.email)
    .bind(new.password_hash)
    .fetch_one(pool)
    .await
    .map_err(classify_insert_error)
}

/// Translate a rejected insert into the reason the caller cares about.
///
/// The names come from the migration: `UNIQUE` on `users.email` creates
/// `users_email_key`. Rename a column, or name a constraint explicitly, and
/// these arms must follow or a duplicate turns into an opaque 500.
fn classify_insert_error(error: sqlx::Error) -> InsertUserError {
    let taken = error.as_database_error().and_then(|db| {
        if !db.is_unique_violation() {
            return None;
        }
        match db.constraint() {
            Some("users_email_key") => Some(InsertUserError::EmailTaken),
            _ => None,
        }
    });

    taken.unwrap_or_else(|| InsertUserError::Database(error))
}
