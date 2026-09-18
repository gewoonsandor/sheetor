use utoipa_axum::{router::OpenApiRouter, routes};

use crate::state::AppState;

mod health;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(health::handler))
}
