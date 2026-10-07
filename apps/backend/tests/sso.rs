//! Which account a single sign-on identity lands in. See `common` for the database gate.

mod common;

use common::{pool, unique, user};
use sheetor_backend::error::sso::SsoError;
use sheetor_backend::error::users::UpdateUserError;
use sheetor_backend::services::sso_service::{Identity, PROVIDER, resolve_user};
use sheetor_backend::services::user_service;

fn identity(email: Option<&str>, verified: bool) -> Identity {
    Identity {
        subject: unique("subject"),
        email: email.map(str::to_owned),
        email_verified: verified,
        name: Some("Kay Cee".to_owned()),
    }
}

#[tokio::test]
async fn a_new_identity_becomes_a_passwordless_account_once() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let email = format!("{}@example.com", unique("kc"));
    let first = identity(Some(&email), true);
    let subject = first.subject.clone();

    let created = resolve_user(&pool, first).await.unwrap();
    assert_eq!(created.provider, PROVIDER);
    assert_eq!(created.provider_id.as_deref(), Some(subject.as_str()));
    assert_eq!(created.password_hash, None);
    assert_eq!(created.username, "Kay Cee");

    let again = Identity {
        subject,
        ..identity(Some(&email), true)
    };
    assert_eq!(resolve_user(&pool, again).await.unwrap().id, created.id);
}

#[tokio::test]
async fn a_verified_email_links_the_existing_account_and_drops_its_password() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let local = user(&pool).await;

    let linked = resolve_user(&pool, identity(Some(&local.email), true))
        .await
        .unwrap();

    assert_eq!(linked.id, local.id);
    assert_eq!(linked.provider, PROVIDER);
    // Signup never confirmed the address, so the password may be a squatter's.
    assert_eq!(local.password_hash.as_deref(), Some("hash"));
    assert_eq!(linked.password_hash, None);
}

#[tokio::test]
async fn an_unverified_email_never_takes_over_an_account() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let local = user(&pool).await;

    let refused = resolve_user(&pool, identity(Some(&local.email), false)).await;

    assert!(matches!(refused, Err(SsoError::EmailTaken)), "{refused:?}");
}

#[tokio::test]
async fn an_identity_without_email_is_refused() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let refused = resolve_user(&pool, identity(None, true)).await;

    assert!(matches!(refused, Err(SsoError::NoEmail)), "{refused:?}");
}

#[tokio::test]
async fn a_display_name_is_trimmed_and_never_blank() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let ada = user(&pool).await;

    let blank = user_service::rename(&pool, ada.id, "   ").await;
    assert!(
        matches!(blank, Err(UpdateUserError::InvalidUsername)),
        "{blank:?}"
    );

    let renamed = user_service::rename(&pool, ada.id, "  Ada  ")
        .await
        .unwrap();
    assert_eq!(renamed.username, "Ada");
}
