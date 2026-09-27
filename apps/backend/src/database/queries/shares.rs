use sqlx::PgPool;
use uuid::Uuid;

use crate::database::schemas::roles::Role;
use crate::database::schemas::shares::Share;

pub async fn upsert_share(
    pool: &PgPool,
    folder_id: Uuid,
    user_id: i32,
    role: Role,
) -> Result<Share, sqlx::Error> {
    sqlx::query_as!(
        Share,
        r#"WITH saved AS (
               INSERT INTO folder_shares (folder_id, user_id, role) VALUES ($1, $2, $3)
               ON CONFLICT (folder_id, user_id) DO UPDATE SET role = EXCLUDED.role
               RETURNING user_id, role
           )
           SELECT u.id AS user_id, u.username, u.email, saved.role AS "role!: Role"
           FROM saved JOIN users u ON u.id = saved.user_id"#,
        folder_id,
        user_id,
        role.as_str(),
    )
    .fetch_one(pool)
    .await
}

pub async fn list_shares(pool: &PgPool, folder_id: Uuid) -> Result<Vec<Share>, sqlx::Error> {
    sqlx::query_as!(
        Share,
        r#"SELECT u.id AS user_id, u.username, u.email, s.role AS "role!: Role"
           FROM folder_shares s JOIN users u ON u.id = s.user_id
           WHERE s.folder_id = $1
           ORDER BY u.username"#,
        folder_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn delete_share(
    pool: &PgPool,
    folder_id: Uuid,
    user_id: i32,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM folder_shares WHERE folder_id = $1 AND user_id = $2",
        folder_id,
        user_id,
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
