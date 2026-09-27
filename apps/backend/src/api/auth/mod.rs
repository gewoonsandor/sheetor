use utoipa_axum::{router::OpenApiRouter, routes};

use crate::state::AppState;

mod config;
mod sso_callback;
mod sso_login;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(config::handler))
        .routes(routes!(sso_login::handler))
        .routes(routes!(sso_callback::handler))
}
