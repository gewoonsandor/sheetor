use serde::Serialize;
use sqlx::FromRow;

/// A row of `users` as it exists in the database.
#[derive(Serialize, FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,

    #[serde(skip_serializing)]
    pub password_hash: Option<String>,

    pub provider: String, // 'local' default otherwis the auth provider
    pub provider_id: Option<String>,
}

/// The fields needed to create a row. Separate from `User` because `id` does
/// not exist until the insert returns.
///
/// It is `password_hash`, never `password`: hashing happens in the service
/// layer, so there is no signature below it that a plaintext password fits.
pub struct NewUser<'a> {
    pub username: &'a str,
    pub email: &'a str,
    pub password_hash: Option<&'a str>,
}
