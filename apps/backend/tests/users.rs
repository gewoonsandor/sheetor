//! User-creation tests. See `common` for the database gate.

mod common;

use common::{pool, unique, user};
use sheetor_backend::database::queries::appearance::{find_appearance, upsert_appearance};
use sheetor_backend::database::queries::users::insert_user;
use sheetor_backend::database::schemas::appearance::{Accent, Appearance, Theme};
use sheetor_backend::error::users::InsertUserError;
use sheetor_backend::services::user_service;

const PASSWORD: &str = "Str0ng-Passw0rd!";

#[tokio::test]
async fn creates_a_user() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let name = unique("ada");
    let email = format!("{name}@example.com");

    let user = insert_user(&pool, &name, &email, "not-a-real-hash")
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
    insert_user(&pool, &unique("user-a"), &email, "hash")
        .await
        .expect("first insert");

    let result = insert_user(&pool, &unique("user-b"), &email, "hash").await;

    let Err(error) = result else {
        panic!("the second insert should have been refused");
    };
    assert!(
        matches!(error, InsertUserError::EmailTaken),
        "expected EmailTaken, got {error:?}"
    );
}

/// Addresses are stored trimmed and lowercased, so one differing only by case or by
/// surrounding spaces is the same address, and taken.
#[tokio::test]
async fn a_signup_differing_only_by_case_is_taken() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let name = unique("Case");

    let created = user_service::create(&pool, "Ada", &format!(" {name}@Example.COM "), PASSWORD)
        .await
        .expect("first signup");
    assert_eq!(
        created.email,
        format!("{}@example.com", name.to_lowercase())
    );

    let again = user_service::create(&pool, "Ada", &format!("{name}@example.com"), PASSWORD).await;
    assert!(
        matches!(again, Err(InsertUserError::EmailTaken)),
        "expected EmailTaken, got {again:?}"
    );
}

/// Refused before any hashing or insert, so the junk never costs argon2 time or a row.
#[tokio::test]
async fn a_signup_with_a_bad_name_or_address_is_refused() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let email = format!("{}@example.com", unique("valid"));
    let too_long_name = "x".repeat(65);
    let too_long_email = format!("{}@example.com", "x".repeat(244));

    for name in ["", "   ", too_long_name.as_str()] {
        let result = user_service::create(&pool, name, &email, PASSWORD).await;
        assert!(
            matches!(result, Err(InsertUserError::InvalidUsername)),
            "{name:?}: {result:?}"
        );
    }

    for address in [
        "",
        "ada",
        "@example.com",
        "ada@",
        "ada@b@c",
        too_long_email.as_str(),
    ] {
        let result = user_service::create(&pool, "Ada", address, PASSWORD).await;
        assert!(
            matches!(result, Err(InsertUserError::InvalidEmail)),
            "{address:?}: {result:?}"
        );
    }
}

/// Usernames are deliberately not unique - the migration puts `UNIQUE` on
/// `email` alone, so a username is a display name and the address is the
/// identity. If someone adds the constraint, this fails and reminds them to
/// add the matching `InsertUserError` variant, without which a duplicate
/// username becomes a 500.
#[tokio::test]
async fn allows_a_repeated_username() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let name = unique("shared-name");
    let first = insert_user(
        &pool,
        &name,
        &format!("{}@example.com", unique("a")),
        "hash",
    )
    .await
    .expect("first insert");

    let second = insert_user(
        &pool,
        &name,
        &format!("{}@example.com", unique("b")),
        "hash",
    )
    .await
    .expect("a second user may share a username");

    assert_eq!(first.username, second.username);
    assert_ne!(first.id, second.id);
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
        tokio::spawn(async move { insert_user(&pool, &username, &email, "hash").await })
    });

    let mut created = 0;
    let mut taken = 0;
    for attempt in attempts.collect::<Vec<_>>() {
        match attempt.await.expect("task panicked") {
            Ok(_) => created += 1,
            Err(InsertUserError::EmailTaken) => taken += 1,
            Err(other) => panic!("expected EmailTaken, got {other:?}"),
        }
    }

    assert_eq!(created, 1, "exactly one signup may take an address");
    assert_eq!(taken, 7);
}

#[tokio::test]
async fn appearance_is_saved_per_user() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let ada = user(&pool).await;
    let bob = user(&pool).await;
    assert_eq!(find_appearance(&pool, ada.id).await.unwrap(), None);

    let light = Appearance {
        theme: Theme::Light,
        accent: Accent::Teal,
        paper_score: false,
    };
    assert_eq!(
        upsert_appearance(&pool, ada.id, light).await.unwrap(),
        light
    );
    assert_eq!(find_appearance(&pool, ada.id).await.unwrap(), Some(light));

    let paper = Appearance {
        theme: Theme::Dark,
        accent: Accent::Rose,
        paper_score: true,
    };
    upsert_appearance(&pool, ada.id, paper).await.unwrap();
    assert_eq!(find_appearance(&pool, ada.id).await.unwrap(), Some(paper));
    assert_eq!(find_appearance(&pool, bob.id).await.unwrap(), None);
}
