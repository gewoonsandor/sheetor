pub mod current_user;
mod folders;
mod library;
mod songs;
mod system;
mod users;

use axum::Json;
use axum::http::StatusCode;
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::router::OpenApiRouter;

use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(title = "Sheetor API", description = "Backend API for the Sheetor editor"),
    tags(
        (name = "system", description = "Service health and metadata"),
        (name = "users", description = "User accounts"),
        (name = "library", description = "Folders and songs visible to the signed-in user"),
        (name = "folders", description = "Folder management and sharing"),
        (name = "songs", description = "Songs and live collaboration"),
    )
)]
struct ApiDoc;

pub fn router(state: AppState) -> (axum::Router, utoipa::openapi::OpenApi) {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .nest("/api/v1", v1(state))
        .split_for_parts()
}

fn v1(state: AppState) -> OpenApiRouter {
    OpenApiRouter::new()
        .nest("/system", system::router())
        .nest("/users", users::router())
        .nest("/folders", folders::router())
        .nest("/songs", songs::router())
        .merge(library::router())
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
