//! Which account a single sign-on identity lands in. See `common` for the database gate.

mod common;

use common::{pool, unique, user};
use sheetor_backend::error::sso::SsoError;
use sheetor_backend::error::users::UpdateUserError;
use sheetor_backend::services::sso_service::{Identity, adopt_legacy_identities, resolve_user};
use sheetor_backend::services::user_service;

const ISSUER: &str = "https://id.example.com/realms/sheetor";

fn identity(email: Option<&str>, verified: bool) -> Identity {
    Identity {
        issuer: ISSUER.to_owned(),
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
    assert_eq!(created.provider, ISSUER);
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
    assert_eq!(linked.provider, ISSUER);
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

/// A subject is only unique at its own issuer: the same one at another provider is
/// someone else, and must never land in the first person's account.
#[tokio::test]
async fn the_same_subject_at_another_issuer_is_another_account() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let first = identity(Some(&format!("{}@example.com", unique("kc"))), true);
    let subject = first.subject.clone();
    let original = resolve_user(&pool, first).await.unwrap();

    let elsewhere = Identity {
        issuer: "https://other.example.com".to_owned(),
        subject,
        ..identity(Some(&format!("{}@example.com", unique("kc"))), true)
    };
    let other = resolve_user(&pool, elsewhere).await.unwrap();

    assert_ne!(other.id, original.id);
    assert_eq!(other.provider, "https://other.example.com");
}

/// Identities stored before the issuer was recorded say `oidc`; after the boot-time move
/// they still sign in to the same account.
#[tokio::test]
async fn a_legacy_identity_still_reaches_its_account() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let local = user(&pool).await;
    let subject = unique("legacy");
    sqlx::query!(
        "UPDATE users SET provider = 'oidc', provider_id = $2 WHERE id = $1",
        local.id,
        subject,
    )
    .execute(&pool)
    .await
    .expect("store a legacy identity");
    let issuer = format!("https://{}.example.com", unique("idp"));

    adopt_legacy_identities(&pool, &issuer).await.unwrap();
    let returning = Identity {
        issuer,
        subject,
        ..identity(None, true)
    };

    assert_eq!(resolve_user(&pool, returning).await.unwrap().id, local.id);
}

#[tokio::test]
async fn a_verified_email_links_whatever_its_case() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let local = user(&pool).await;
    let shouting = format!("  {}  ", local.email.to_uppercase());

    let linked = resolve_user(&pool, identity(Some(&shouting), true))
        .await
        .unwrap();

    assert_eq!(
        linked.id, local.id,
        "a verified address links whatever its case"
    );
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
