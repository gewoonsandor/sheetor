//! What may and may not authenticate. See `common` for the database gate.

mod common;

use axum_login::AuthnBackend;
use common::{pool, unique};
use sheetor_backend::services::auth_service::{Backend, Credentials};
use sheetor_backend::services::user_service;
use sqlx::PgPool;

const PASSWORD: &str = "Str0ng-Passw0rd!";

/// Signs a user up through the service, so the stored value is a real argon2
/// hash rather than a string that only looks like one.
async fn signup(pool: &PgPool) -> (Backend, String) {
    let email = format!("{}@example.com", unique("auth"));
    user_service::create(pool, &unique("name"), &email, PASSWORD)
        .await
        .expect("signup");

    (Backend::new(pool.clone()), email)
}

#[tokio::test]
async fn authenticates_a_correct_password() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let (backend, email) = signup(&pool).await;

    let user = backend
        .authenticate(Credentials {
            email: email.clone(),
            password: PASSWORD.to_owned(),
        })
        .await
        .expect("authenticate")
        .expect("the correct password should authenticate");

    assert_eq!(user.email, email);
}

/// Signup stores the address lowercased and login lowercases what it is given, so the
/// case someone types never decides whether they get in.
#[tokio::test]
async fn an_address_signs_in_whatever_its_case() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let name = unique("Mixed");
    user_service::create(&pool, "Ada", &format!("{name}@Example.com"), PASSWORD)
        .await
        .expect("signup");

    for typed in [
        format!("{}@example.com", name.to_lowercase()),
        format!(" {}@EXAMPLE.COM ", name.to_uppercase()),
    ] {
        let user = Backend::new(pool.clone())
            .authenticate(Credentials {
                email: typed.clone(),
                password: PASSWORD.to_owned(),
            })
            .await
            .expect("authenticate");
        assert!(user.is_some(), "{typed:?} should sign in");
    }
}

#[tokio::test]
async fn rejects_a_wrong_password() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let (backend, email) = signup(&pool).await;

    let result = backend
        .authenticate(Credentials {
            email,
            password: "Wr0ng-Passw0rd!".to_owned(),
        })
        .await
        .expect("authenticate");

    assert!(result.is_none(), "a wrong password must not authenticate");
}

/// An address nobody registered is not an error, it is simply not a user - the
/// handler turns both this and a wrong password into the same 401.
#[tokio::test]
async fn rejects_an_unknown_email() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };

    let result = Backend::new(pool)
        .authenticate(Credentials {
            email: format!("{}@example.com", unique("nobody")),
            password: PASSWORD.to_owned(),
        })
        .await
        .expect("authenticate");

    assert!(result.is_none());
}

/// `password_hash` is nullable so a provider account can exist without a local
/// password. Such a row must be unreachable by password - including the empty
/// one, which is what a naive `unwrap_or_default` on the hash would accept.
#[tokio::test]
async fn refuses_a_provider_account_with_no_password() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let (backend, email) = signup(&pool).await;

    sqlx::query!(
        "UPDATE users SET password_hash = NULL, provider = 'github' WHERE email = $1",
        email,
    )
    .execute(&pool)
    .await
    .expect("drop the local password");

    for password in [PASSWORD, ""] {
        let result = backend
            .authenticate(Credentials {
                email: email.clone(),
                password: password.to_owned(),
            })
            .await
            .expect("authenticate");

        assert!(
            result.is_none(),
            "a provider account must not authenticate with {password:?}"
        );
    }
}
