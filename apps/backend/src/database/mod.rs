pub mod queries;
pub mod schemas;

use sqlx::{PgPool, postgres::PgPoolOptions};
use std::env;
use std::time::Duration;

pub async fn init_pool() -> PgPool {
    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL environment variable is required");

    let pool = PgPoolOptions::new()
        .max_connections(20) // TODO: set to env variable with default
        .acquire_timeout(Duration::from_secs(3))
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run database migrations");

    pool
}
