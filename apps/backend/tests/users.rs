//! User-creation tests. These need a real Postgres:
//!
//! ```bash
//! createdb -h 127.0.0.1 -U postgres sheetor_test
//! TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test
//! ```
//!
//! With `TEST_DATABASE_URL` unset every test logs and passes, so `npm run
//! check` stays green on a machine with no database.

use std::time::{SystemTime, UNIX_EPOCH};

use sheetor_backend::database::schemas::users::{CreateUserError, NewUser, create_user};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

async fn pool() -> Option<PgPool> {
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
fn unique(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{prefix}-{nanos}")
}

#[tokio::test]
async fn creates_a_user() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let name = unique("ada");
    let email = format!("{name}@example.com");

    let user = create_user(
        &pool,
        NewUser {
            username: &name,
            email: &email,
            password_hash: Some("not-a-real-hash"),
        },
    )
    .await
    .expect("create");

    assert!(user.id > 0);
    assert_eq!(user.username, name);
    assert_eq!(user.email, email);
    assert_eq!(user.password_hash.as_deref(), Some("not-a-real-hash"));
    assert_eq!(user.provider, "local", "the column default should apply");
    assert_eq!(user.provider_id, None);
}

#[tokio::test]
async fn rejects_a_duplicate_email() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let email = format!("{}@example.com", unique("dup-email"));
    let first = NewUser {
        username: &unique("user-a"),
        email: &email,
        password_hash: None,
    };
    create_user(&pool, first).await.expect("first insert");

    let second_name = unique("user-b");
    let result = create_user(
        &pool,
        NewUser {
            username: &second_name,
            email: &email,
            password_hash: None,
        },
    )
    .await;

    assert!(
        matches!(result, Err(CreateUserError::EmailTaken)),
        "expected EmailTaken, got {result:?}"
    );
}

#[tokio::test]
async fn rejects_a_duplicate_username() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let name = unique("dup-name");
    create_user(
        &pool,
        NewUser {
            username: &name,
            email: &format!("{}@example.com", unique("a")),
            password_hash: None,
        },
    )
    .await
    .expect("first insert");

    let result = create_user(
        &pool,
        NewUser {
            username: &name,
            email: &format!("{}@example.com", unique("b")),
            password_hash: None,
        },
    )
    .await;

    assert!(
        matches!(result, Err(CreateUserError::UsernameTaken)),
        "expected UsernameTaken, got {result:?}"
    );
}

/// The reason there is no "is this email free?" query before the insert. Eight
/// requests race for one address; exactly one may win, and the losers must be
/// told the address is taken rather than handed a 500.
#[tokio::test]
async fn only_one_of_many_racing_signups_wins() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let email = format!("{}@example.com", unique("race"));

    let attempts = (0..8).map(|i| {
        let pool = pool.clone();
        let email = email.clone();
        let username = unique(&format!("racer-{i}"));
        tokio::spawn(async move {
            create_user(
                &pool,
                NewUser {
                    username: &username,
                    email: &email,
                    password_hash: None,
                },
            )
            .await
        })
    });

    let mut created = 0;
    let mut taken = 0;
    for attempt in attempts.collect::<Vec<_>>() {
        match attempt.await.expect("task panicked") {
            Ok(_) => created += 1,
            Err(CreateUserError::EmailTaken) => taken += 1,
            Err(other) => panic!("expected EmailTaken, got {other:?}"),
        }
    }

    assert_eq!(created, 1, "exactly one signup may take an address");
    assert_eq!(taken, 7);
}
