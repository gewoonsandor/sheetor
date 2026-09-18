//! Shared gate for the tests that need a real Postgres.
//!
//! ```bash
//! TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test
//! ```
//!
//! The dev shell starts a cluster and creates `sheetor_test`, so only the
//! variable has to be set. With `TEST_DATABASE_URL` unset every test logs and
//! passes, so `npm run check` stays green on a machine with no database.

use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

pub async fn pool() -> Option<PgPool> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new()
        .max_connections(16)
        .connect(&url)
        .await
        .expect("connect to TEST_DATABASE_URL");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("run migrations");

    Some(pool)
}

/// Every test invents its own names, so they share one database without
/// colliding and without a truncate between them.
pub fn unique(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{prefix}-{nanos}")
}
