use utoipa_axum::{router::OpenApiRouter, routes};

use crate::state::AppState;

mod list;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(list::handler))
}
