//! The app as a browser reaches it: `app::build` served on a real socket, so the
//! per-client limits see a peer address and every layer runs. See `common` for the
//! database gate.

mod common;

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

use axum::http::{HeaderMap, HeaderValue};
use common::{pool, unique};
use openidconnect::reqwest::Client;
use serde_json::json;
use sheetor_backend::app;
use sheetor_backend::config::Config;
use sheetor_backend::frontend::content_security_policy;
use sheetor_backend::services::auth_service::client_ip;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

/// `app::build` creates the session table; two first runs racing to create it collide.
static BUILD: Mutex<()> = Mutex::const_new(());

/// Serves the whole app on a free local port, as `main` does; returns its origin.
async fn serve(pool: PgPool) -> String {
    let config = Config {
        host: "127.0.0.1".to_owned(),
        port: 0,
        log_level: "info".to_owned(),
        frontend_dist_dir: PathBuf::from("/nonexistent"),
        cookie_secure: false,
        public_url: "http://localhost".to_owned(),
        local_auth_enabled: true,
        docs_enabled: false,
        trust_proxy: false,
        sso: None,
    };
    let app = {
        let _one_at_a_time = BUILD.lock().await;
        app::build(&config, pool).await
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("local address");
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
    });
    format!("http://{address}")
}

async fn post(client: &Client, url: &str, body: serde_json::Value) -> u16 {
    client
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .expect("request")
        .status()
        .as_u16()
}

/// Five tries per address per window, then 429: keyed on the address as stored, so
/// changing its case buys no more tries, and other addresses keep theirs.
#[tokio::test]
async fn login_is_refused_after_five_tries_per_address() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let login = format!("{}/api/v1/users/login", serve(pool).await);
    let client = Client::new();
    let guess = |email: &str| json!({ "email": email, "password": "Wr0ng-Passw0rd!" });
    let email = format!("{}@example.com", unique("guess"));

    for _ in 0..5 {
        assert_eq!(post(&client, &login, guess(&email)).await, 401);
    }
    assert_eq!(
        post(&client, &login, guess(&email.to_uppercase())).await,
        429
    );

    let bystander = format!("{}@example.com", unique("bystander"));
    assert_eq!(post(&client, &login, guess(&bystander)).await, 401);
}

/// Ten sign-ups per client per hour, counted before validation, so refused ones use
/// them up too.
#[tokio::test]
async fn signup_is_refused_after_ten_per_client() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let create = format!("{}/api/v1/users/create", serve(pool).await);
    let client = Client::new();
    let weak = || {
        json!({
            "username": "Ada",
            "email": format!("{}@example.com", unique("signup")),
            "password": "weak",
        })
    };

    for _ in 0..10 {
        assert_eq!(post(&client, &create, weak()).await, 400);
    }
    assert_eq!(post(&client, &create, weak()).await, 429);
}

/// The peer unless the proxy is trusted; then the entry the proxy appended, never one
/// the client wrote in front of it.
#[test]
fn the_client_address_is_the_last_forwarded_one_only_behind_a_trusted_proxy() {
    let peer: SocketAddr = "10.0.0.2:5000".parse().unwrap();
    let mut headers = HeaderMap::new();
    assert_eq!(client_ip(&headers, peer, true), peer.ip(), "no header");

    headers.insert(
        "x-forwarded-for",
        HeaderValue::from_static("1.1.1.1, 203.0.113.7"),
    );
    assert_eq!(client_ip(&headers, peer, false), peer.ip());
    assert_eq!(
        client_ip(&headers, peer, true),
        "203.0.113.7".parse::<IpAddr>().unwrap()
    );

    headers.insert("x-forwarded-for", HeaderValue::from_static("1.1.1.1, junk"));
    assert_eq!(client_ip(&headers, peer, true), peer.ip(), "unparsable");
}

#[tokio::test]
async fn responses_carry_the_security_headers_and_docs_stay_off() {
    let Some(pool) = pool().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let origin = serve(pool).await;
    let client = Client::new();

    let health = client
        .get(format!("{origin}/api/v1/system/health"))
        .send()
        .await
        .expect("request");
    let headers = health.headers();
    assert_eq!(headers["x-content-type-options"], "nosniff");
    assert_eq!(headers["referrer-policy"], "same-origin");
    let policy = headers["content-security-policy"].to_str().unwrap();
    assert!(policy.contains("frame-ancestors 'none'"), "{policy}");
    assert!(
        !headers.contains_key("strict-transport-security"),
        "HSTS only with secure cookies"
    );

    let docs = client
        .get(format!("{origin}/docs/openapi.json"))
        .send()
        .await
        .expect("request");
    assert_eq!(docs.status().as_u16(), 404, "DOCS_ENABLED defaults to off");
}

/// Every inline script of the served `index.html` is allowed by its hash, and a script
/// loaded by `src` needs none.
#[test]
fn the_policy_allows_exactly_the_inline_scripts() {
    let html = r#"<html><head><script>alert(1)</script></head><body>
<script type="module" crossorigin src="/assets/index.js"></script>
<script>document.title = "x";</script></body></html>"#;

    let policy = content_security_policy(html, "https://sheetor.example.com");
    let policy = policy.to_str().unwrap();

    let scripts = policy
        .split("; ")
        .find(|directive| directive.starts_with("script-src"));
    assert_eq!(
        scripts,
        Some(
            "script-src 'self' 'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=' \
             'sha256-SMvsNDpfnjuHfEuQmiwN5xVKOubsOJP6wvxn2UhM8x8='"
        )
    );
    assert!(
        policy.contains("connect-src 'self' wss://sheetor.example.com;"),
        "{policy}"
    );
}
