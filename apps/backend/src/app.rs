use axum::Router;
use axum::routing::any;
use axum_login::AuthManagerLayerBuilder;
use sqlx::PgPool;
use tower_http::trace::TraceLayer;
use tower_sessions::SessionManagerLayer;
use tower_sessions::cookie::SameSite;
use tower_sessions_sqlx_store::PostgresStore;
use utoipa_swagger_ui::SwaggerUi;

use crate::config::Config;
use crate::services::auth_service::Backend;
use crate::state::{AppState, AuthSettings};
use crate::{api, frontend};

pub async fn build(config: &Config, db: PgPool) -> Router {
    let session_store = PostgresStore::new(db.clone());
    session_store
        .migrate()
        .await
        .expect("create the session table");

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
        .merge(SwaggerUi::new("/docs").url("/docs/openapi.json", openapi))
        .layer(auth_layer);

    frontend::serve(router, config).layer(TraceLayer::new_for_http())
}
