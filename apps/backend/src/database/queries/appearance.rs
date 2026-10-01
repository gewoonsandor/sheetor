use sqlx::PgPool;

use crate::database::schemas::appearance::{Accent, Appearance, Theme};

pub async fn find_appearance(
    pool: &PgPool,
    user_id: i32,
) -> Result<Option<Appearance>, sqlx::Error> {
    sqlx::query_as!(
        Appearance,
        r#"SELECT theme AS "theme: Theme", accent AS "accent: Accent", paper_score
           FROM user_appearance WHERE user_id = $1"#,
        user_id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn upsert_appearance(
    pool: &PgPool,
    user_id: i32,
    appearance: Appearance,
) -> Result<Appearance, sqlx::Error> {
    sqlx::query_as!(
        Appearance,
        r#"INSERT INTO user_appearance (user_id, theme, accent, paper_score)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET
               theme = EXCLUDED.theme,
               accent = EXCLUDED.accent,
               paper_score = EXCLUDED.paper_score
           RETURNING theme AS "theme: Theme", accent AS "accent: Accent", paper_score"#,
        user_id,
        appearance.theme.as_str(),
        appearance.accent.as_str(),
        appearance.paper_score,
    )
    .fetch_one(pool)
    .await
}
