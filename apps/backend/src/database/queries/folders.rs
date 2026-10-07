use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::database::schemas::folders::{Folder, FolderRecord};
use crate::database::schemas::roles::Role;

pub async fn insert_folder(
    conn: &mut PgConnection,
    owner_id: i32,
    parent_id: Option<Uuid>,
    name: &str,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO folders (owner_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
        owner_id,
        parent_id,
        name,
    )
    .fetch_one(conn)
    .await
}

pub async fn find_folder(pool: &PgPool, id: Uuid) -> Result<Option<FolderRecord>, sqlx::Error> {
    sqlx::query_as!(
        FolderRecord,
        "SELECT id, owner_id, parent_id FROM folders WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

/// One folder as `user_id` sees it. The parent is hidden when they cannot see it.
pub async fn folder_view(
    pool: &PgPool,
    id: Uuid,
    user_id: i32,
) -> Result<Option<Folder>, sqlx::Error> {
    sqlx::query_as!(
        Folder,
        r#"SELECT f.id, f.name, f.owner_id, u.username AS owner_name,
                  CASE WHEN folder_role($2, f.parent_id) IS NOT NULL THEN f.parent_id END
                      AS parent_id,
                  folder_role($2, f.id) AS "role!: Role",
                  EXISTS (SELECT 1 FROM folder_shares x WHERE x.folder_id = f.id) AS "is_shared!"
           FROM folders f JOIN users u ON u.id = f.owner_id
           WHERE f.id = $1"#,
        id,
        user_id,
    )
    .fetch_optional(pool)
    .await
}

/// Every folder `user_id` owns or reaches through a share, with their best role on each.
/// A folder whose parent they cannot see arrives with `parent_id = NULL`.
pub async fn accessible_folders(
    conn: &mut PgConnection,
    user_id: i32,
) -> Result<Vec<Folder>, sqlx::Error> {
    // UNION, not UNION ALL: a share inside another share would otherwise walk its subtree
    // once per share above it, quadratic in a chain of nested shares.
    sqlx::query_as!(
        Folder,
        r#"WITH RECURSIVE shared AS (
               SELECT s.folder_id AS id, s.role FROM folder_shares s WHERE s.user_id = $1
             UNION
               SELECT f.id, shared.role FROM folders f JOIN shared ON f.parent_id = shared.id
           ), access AS (
               SELECT id, 'owner'::text AS role FROM folders WHERE owner_id = $1
             UNION ALL
               SELECT id, role FROM shared
           ), best AS (
               SELECT id, CASE WHEN bool_or(role = 'owner') THEN 'owner'
                               WHEN bool_or(role = 'editor') THEN 'editor'
                               ELSE 'viewer' END AS role
               FROM access GROUP BY id
           )
           SELECT f.id, f.name, f.owner_id, u.username AS owner_name,
                  CASE WHEN f.parent_id IN (SELECT id FROM best) THEN f.parent_id END
                      AS parent_id,
                  best.role AS "role!: Role",
                  EXISTS (SELECT 1 FROM folder_shares x WHERE x.folder_id = f.id) AS "is_shared!"
           FROM best JOIN folders f ON f.id = best.id JOIN users u ON u.id = f.owner_id
           ORDER BY f.name"#,
        user_id,
    )
    .fetch_all(conn)
    .await
}

pub async fn folder_role(
    pool: &PgPool,
    user_id: i32,
    folder_id: Uuid,
) -> Result<Option<Role>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT folder_role($1, $2) AS "role?: Role""#,
        user_id,
        folder_id,
    )
    .fetch_one(pool)
    .await
}

/// Until the transaction ends, Postgres cancels any statement running longer than `timeout`
/// (a duration such as `5s`).
pub async fn set_statement_timeout(
    conn: &mut PgConnection,
    timeout: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT set_config('statement_timeout', $1, true) AS "timeout!""#,
        timeout,
    )
    .fetch_one(conn)
    .await?;
    Ok(())
}

pub async fn rename_folder(pool: &PgPool, id: Uuid, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE folders SET name = $2 WHERE id = $1", id, name)
        .execute(pool)
        .await?;
    Ok(())
}

/// Serialises tree changes within one owner's library until the transaction ends, so two
/// concurrent changes cannot each pass the cycle or depth check and together break it.
pub async fn lock_library(conn: &mut PgConnection, owner_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT true AS "locked!" FROM pg_advisory_xact_lock($1)"#,
        i64::from(owner_id),
    )
    .fetch_one(conn)
    .await?;
    Ok(())
}

/// True when `ancestor` is `candidate` or lies on its path to the root.
pub async fn is_descendant(
    conn: &mut PgConnection,
    candidate: Uuid,
    ancestor: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH RECURSIVE up AS (
               SELECT id, parent_id FROM folders WHERE id = $1
             UNION ALL
               SELECT f.id, f.parent_id FROM folders f JOIN up ON f.id = up.parent_id
           )
           SELECT EXISTS (SELECT 1 FROM up WHERE id = $2) AS "found!""#,
        candidate,
        ancestor,
    )
    .fetch_one(conn)
    .await
}

/// How many levels deep the lowest folder would sit if `folder`'s subtree, or a new folder
/// when `None`, hung under `parent`.
pub async fn depth_under(
    conn: &mut PgConnection,
    parent: Uuid,
    folder: Option<Uuid>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH RECURSIVE up AS (
               SELECT id, parent_id FROM folders WHERE id = $1
             UNION ALL
               SELECT f.id, f.parent_id FROM folders f JOIN up ON f.id = up.parent_id
           ), down AS (
               SELECT id, 1 AS level FROM folders WHERE id = $2
             UNION ALL
               SELECT f.id, down.level + 1 FROM folders f JOIN down ON f.parent_id = down.id
           )
           SELECT (SELECT count(*) FROM up) + COALESCE((SELECT max(level) FROM down), 1)
               AS "depth!""#,
        parent,
        folder,
    )
    .fetch_one(conn)
    .await
}

pub async fn set_folder_parent(
    conn: &mut PgConnection,
    id: Uuid,
    parent_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE folders SET parent_id = $2 WHERE id = $1",
        id,
        parent_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Hands the folder's subfolders and songs to its parent, then deletes it.
pub async fn delete_folder(conn: &mut PgConnection, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE folders SET parent_id = (SELECT parent_id FROM folders WHERE id = $1)
         WHERE parent_id = $1",
        id,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "UPDATE songs SET folder_id = (SELECT parent_id FROM folders WHERE id = $1)
         WHERE folder_id = $1",
        id,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!("DELETE FROM folders WHERE id = $1", id)
        .execute(conn)
        .await?;
    Ok(())
}
