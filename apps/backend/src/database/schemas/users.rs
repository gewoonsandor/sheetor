use serde::Serialize;
use sqlx::FromRow;
use utoipa::ToSchema;

/// A row of `users` as it exists in the database.
#[derive(Debug, Clone, Serialize, FromRow, ToSchema)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,

    #[serde(skip_serializing)]
    #[schema(ignore)]
    pub password_hash: Option<String>,

    pub provider: String, // 'local' default otherwis the auth provider
    pub provider_id: Option<String>,
}
