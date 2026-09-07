mod health;

use axum::Json;
use axum::http::StatusCode;
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(title = "Sheetor API", description = "Backend API for the Sheetor editor"),
    tags((name = "system", description = "Service health and metadata"))
)]
struct ApiDoc;

pub fn router(state: AppState) -> (axum::Router, utoipa::openapi::OpenApi) {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .nest("/api/v1", v1(state))
        .split_for_parts()
}

fn v1(state: AppState) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(health::health))
        .with_state(state)
}

#[derive(Serialize, ToSchema)]
pub struct ApiError {
    message: String,
}

pub async fn not_found() -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::NOT_FOUND,
        Json(ApiError {
            message: "Not Found".to_owned(),
        }),
    )
}
