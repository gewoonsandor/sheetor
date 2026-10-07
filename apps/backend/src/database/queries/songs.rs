use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::database::schemas::roles::Role;
use crate::database::schemas::songs::{Song, SongRecord, SongSummary};

pub struct NewSong<'a> {
    pub owner_id: i32,
    pub folder_id: Option<Uuid>,
    pub summary: &'a SongSummary,
    pub state: &'a [u8],
    pub created_by: i32,
}

pub async fn insert_song(pool: &PgPool, song: NewSong<'_>) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO songs (owner_id, folder_id, title, artist, bpm, track_count, bar_count,
                            state, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id",
        song.owner_id,
        song.folder_id,
        song.summary.title,
        song.summary.artist,
        song.summary.bpm,
        song.summary.track_count,
        song.summary.bar_count,
        song.state,
        song.created_by,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_song(pool: &PgPool, id: Uuid) -> Result<Option<SongRecord>, sqlx::Error> {
    sqlx::query_as!(
        SongRecord,
        "SELECT id, owner_id, folder_id FROM songs WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

/// One song as `user_id` sees it. Call only after checking they may see it.
pub async fn song_view(pool: &PgPool, id: Uuid, user_id: i32) -> Result<Option<Song>, sqlx::Error> {
    sqlx::query_as!(
        Song,
        r#"SELECT s.id, s.folder_id, s.owner_id, s.title, s.artist, s.bpm, s.track_count,
                  s.bar_count,
                  CASE WHEN s.owner_id = $2 THEN 'owner' ELSE folder_role($2, s.folder_id) END
                      AS "role!: Role",
                  (EXTRACT(EPOCH FROM s.updated_at) * 1000)::BIGINT AS "updated_at!",
                  u.username AS "updated_by_name?"
           FROM songs s LEFT JOIN users u ON u.id = s.updated_by
           WHERE s.id = $1"#,
        id,
        user_id,
    )
    .fetch_optional(pool)
    .await
}

/// The songs `user_id` owns plus those inside `folder_ids`, most recently changed first.
pub async fn accessible_songs(
    conn: &mut PgConnection,
    user_id: i32,
    folder_ids: &[Uuid],
) -> Result<Vec<Song>, sqlx::Error> {
    sqlx::query_as!(
        Song,
        r#"SELECT s.id, s.folder_id, s.owner_id, s.title, s.artist, s.bpm, s.track_count,
                  s.bar_count,
                  CASE WHEN s.owner_id = $1 THEN 'owner' ELSE folder_role($1, s.folder_id) END
                      AS "role!: Role",
                  (EXTRACT(EPOCH FROM s.updated_at) * 1000)::BIGINT AS "updated_at!",
                  u.username AS "updated_by_name?"
           FROM songs s LEFT JOIN users u ON u.id = s.updated_by
           WHERE s.owner_id = $1 OR s.folder_id = ANY($2)
           ORDER BY s.updated_at DESC"#,
        user_id,
        folder_ids,
    )
    .fetch_all(conn)
    .await
}

/// `None` when the song does not exist; `Some(None)` when it exists but `user_id` has no access.
pub async fn song_role(
    pool: &PgPool,
    user_id: i32,
    song_id: Uuid,
) -> Result<Option<Option<Role>>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT CASE WHEN owner_id = $1 THEN 'owner' ELSE folder_role($1, folder_id) END
               AS "role?: Role"
           FROM songs WHERE id = $2"#,
        user_id,
        song_id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn load_state(pool: &PgPool, id: Uuid) -> Result<Option<Vec<u8>>, sqlx::Error> {
    sqlx::query_scalar!("SELECT state FROM songs WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn save_state(
    pool: &PgPool,
    id: Uuid,
    state: &[u8],
    summary: &SongSummary,
    updated_by: Option<i32>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE songs
         SET state = $2, title = $3, artist = $4, bpm = $5, track_count = $6, bar_count = $7,
             updated_by = COALESCE($8, updated_by), updated_at = now()
         WHERE id = $1",
        id,
        state,
        summary.title,
        summary.artist,
        summary.bpm,
        summary.track_count,
        summary.bar_count,
        updated_by,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_song_folder(
    pool: &PgPool,
    id: Uuid,
    folder_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE songs SET folder_id = $2 WHERE id = $1",
        id,
        folder_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_song(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM songs WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}
