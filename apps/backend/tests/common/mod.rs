//! Shared gate for the tests that need a real Postgres.
//!
//! ```bash
//! TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test
//! ```
//!
//! The dev shell starts a cluster and creates `sheetor_test`, so only the
//! variable has to be set. With `TEST_DATABASE_URL` unset every test logs and
//! passes, so `npm run check` stays green on a machine with no database.

// Each test crate uses a different subset of these helpers.
#![allow(dead_code)]

use std::time::{SystemTime, UNIX_EPOCH};

use sheetor_backend::database::queries::users::insert_user;
use sheetor_backend::database::schemas::User;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use yrs::{ArrayPrelim, Doc, In, Map, MapPrelim, ReadTxn, StateVector, Transact};

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

pub async fn user(pool: &PgPool) -> User {
    let name = unique("user");
    insert_user(pool, &name, &format!("{name}@example.com"), "hash")
        .await
        .expect("create user")
}

/// A song document as the browser would upload it: one track with no bars.
pub fn song_state(title: &str) -> Vec<u8> {
    let doc = Doc::new();
    let song = doc.get_or_insert_map("song");
    let mut txn = doc.transact_mut();
    song.insert(&mut txn, "title", title);
    song.insert(&mut txn, "artist", "Band");
    song.insert(&mut txn, "bpm", 120);
    let track = MapPrelim::from([("measures", In::from(ArrayPrelim::default()))]);
    song.insert(&mut txn, "tracks", ArrayPrelim::from([In::from(track)]));
    txn.encode_state_as_update_v1(&StateVector::default())
}
