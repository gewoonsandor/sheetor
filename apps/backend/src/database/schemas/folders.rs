use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use super::roles::Role;

/// A folder as one user sees it: `role` is theirs, and `parent_id` is `None`
/// when the parent is outside what they can see (the root of a share).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Folder {
    pub id: Uuid,
    pub name: String,
    pub parent_id: Option<Uuid>,
    pub owner_id: i32,
    pub owner_name: String,
    pub role: Role,
    pub is_shared: bool,
}

#[derive(Debug, Clone)]
pub struct FolderRecord {
    pub id: Uuid,
    pub owner_id: i32,
    pub parent_id: Option<Uuid>,
}
