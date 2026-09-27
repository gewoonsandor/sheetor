use serde::Serialize;
use utoipa::ToSchema;

use super::roles::Role;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Share {
    pub user_id: i32,
    pub username: String,
    pub email: String,
    pub role: Role,
}
