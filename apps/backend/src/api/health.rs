use axum::Json;
use axum::extract::State;
use chrono::Utc;
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct Health {
    status: String,
    uptime: f64,
    timestamp: String,
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    summary = "Health check",
    responses((status = 200, description = "Service is healthy", body = Health)),
)]
pub async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok".to_owned(),
        uptime: state.started_at.elapsed().as_secs_f64(),
        timestamp: Utc::now().to_rfc3339(),
    })
}
