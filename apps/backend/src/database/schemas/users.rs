use serde::Serialize;
use sqlx::{FromRow, PgPool};

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,

    #[serde(skip_serializing)]
    pub password_hash: Option<String>,

    pub provider: String, // 'local', otherwise the auth provider
    pub provider_id: Option<String>,
}

/// The fields a caller must supply to create a user.
///
/// It is `password_hash`, never `password`: hashing happens above this layer,
/// so there is no signature here that a plaintext password fits through.
pub struct NewUser<'a> {
    pub username: &'a str,
    pub email: &'a str,
    pub password_hash: Option<&'a str>,
}

/// Why a user could not be created.
#[derive(Debug)]
pub enum CreateUserError {
    UsernameTaken,
    EmailTaken,
    Database(sqlx::Error),
}

/// Create a user, or report which field was already taken.
///
/// There is deliberately no "is this email free?" query first. Between that
/// check and the insert another request can take the name, and both callers
/// then believe they won - the classic time-of-check/time-of-use race. The
/// `UNIQUE` constraints are the only thing that can answer the question
/// atomically, so we attempt the write and let Postgres arbitrate. One round
/// trip instead of two, and correct no matter how many requests arrive at once.
pub async fn create_user(pool: &PgPool, new: NewUser<'_>) -> Result<User, CreateUserError> {
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
/// Postgres names the constraint it enforced, and the names come from the
/// migration: `UNIQUE` on `users.email` creates `users_email_key`. Rename a
/// column or add an explicit `CONSTRAINT` name and these arms must follow, or
/// a duplicate turns into an opaque 500.
fn classify_insert_error(error: sqlx::Error) -> CreateUserError {
    let taken = error.as_database_error().and_then(|db| {
        if !db.is_unique_violation() {
            return None;
        }
        match db.constraint() {
            Some("users_username_key") => Some(CreateUserError::UsernameTaken),
            Some("users_email_key") => Some(CreateUserError::EmailTaken),
            _ => None,
        }
    });

    taken.unwrap_or_else(|| CreateUserError::Database(error))
}
