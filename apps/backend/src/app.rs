use std::time::Duration;

use axum::Router;
use axum::http::HeaderValue;
use axum::http::header::{REFERRER_POLICY, STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS};
use axum::routing::any;
use axum_login::AuthManagerLayerBuilder;
use sqlx::PgPool;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use tower_sessions::cookie::SameSite;
use tower_sessions::{ExpiredDeletion, SessionManagerLayer};
use tower_sessions_sqlx_store::PostgresStore;
use utoipa_swagger_ui::SwaggerUi;

use crate::config::Config;
use crate::services::auth_service::Backend;
use crate::services::sso_service;
use crate::state::{AppState, AuthSettings};
use crate::{api, frontend};

pub async fn build(config: &Config, db: PgPool) -> Router {
    let session_store = PostgresStore::new(db.clone());
    session_store
        .migrate()
        .await
        .expect("create the session table");
    // Every visit to the SSO login leaves a session row, signed in or not.
    tokio::spawn(delete_expired_sessions(session_store.clone()));

    if let Some(sso) = &config.sso {
        let moved = sso_service::adopt_legacy_identities(&db, &sso.issuer_url)
            .await
            .expect("move the oidc identities to the issuer");
        if moved > 0 {
            tracing::info!(moved, issuer = %sso.issuer_url, "sso identities keyed by issuer");
        }
    }

    // Lax, not Strict: the identity provider's redirect back to the SSO callback is a
    // cross-site navigation, and a Strict cookie would not carry the pending login.
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(config.cookie_secure)
        .with_same_site(SameSite::Lax);
    let auth_layer = AuthManagerLayerBuilder::new(Backend::new(db.clone()), session_layer).build();

    let state = AppState::new(
        db,
        config.public_url.clone(),
        AuthSettings::from_config(config),
    );
    let (api_router, openapi) = api::router(state);

    let router = Router::new()
        .merge(api_router)
        .route("/api", any(api::not_found))
        .route("/api/{*path}", any(api::not_found))
        .layer(auth_layer);
    // After `frontend::serve`, so Swagger UI is outside the app's Content-Security-Policy.
    let mut router = frontend::serve(router, config);
    if config.docs_enabled {
        router = router.merge(SwaggerUi::new("/docs").url("/docs/openapi.json", openapi));
    }

    router = router
        .layer(header(X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .layer(header(REFERRER_POLICY, "same-origin"));
    if config.cookie_secure {
        router = router.layer(header(STRICT_TRANSPORT_SECURITY, "max-age=31536000"));
    }
    router.layer(TraceLayer::new_for_http())
}

fn header(
    name: axum::http::HeaderName,
    value: &'static str,
) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::if_not_present(name, HeaderValue::from_static(value))
}

async fn delete_expired_sessions(store: PostgresStore) {
    let mut hourly = tokio::time::interval(Duration::from_secs(60 * 60));
    loop {
        hourly.tick().await;
        if let Err(error) = store.delete_expired().await {
            tracing::warn!(?error, "deleting expired sessions failed");
        }
    }
}
