use axum::Router;
use axum::routing::any;
use tower_http::trace::TraceLayer;
use utoipa_swagger_ui::SwaggerUi;

use crate::config::Config;
use crate::state::AppState;
use crate::{api, frontend};

pub fn build(config: &Config) -> Router {
    let (api_router, openapi) = api::router(AppState::default());

    let router = Router::new()
        .merge(api_router)
        .route("/api", any(api::not_found))
        .route("/api/{*path}", any(api::not_found))
        .merge(SwaggerUi::new("/docs").url("/docs/openapi.json", openapi));

    frontend::serve(router, config).layer(TraceLayer::new_for_http())
}
