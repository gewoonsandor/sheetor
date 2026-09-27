use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use super::roles::Role;

/// A song's listing entry as one user sees it; the content itself is `state`.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Song {
    pub id: Uuid,
    pub folder_id: Option<Uuid>,
    pub owner_id: i32,
    pub title: String,
    pub artist: String,
    pub bpm: i32,
    pub track_count: i32,
    pub bar_count: i32,
    pub role: Role,
    /// Milliseconds since the Unix epoch.
    pub updated_at: i64,
    pub updated_by_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SongRecord {
    pub id: Uuid,
    pub owner_id: i32,
    pub folder_id: Option<Uuid>,
}

/// The columns read out of a song document so the library can list it without decoding it.
#[derive(Debug, Clone, PartialEq)]
pub struct SongSummary {
    pub title: String,
    pub artist: String,
    pub bpm: i32,
    pub track_count: i32,
    pub bar_count: i32,
}
