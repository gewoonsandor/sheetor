use axum::routing::get;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::state::AppState;

mod create;
mod duplicate;
mod live;
mod relocate;
mod remove;
mod show;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create::handler))
        .routes(routes!(show::handler, remove::handler))
        .routes(routes!(duplicate::handler))
        .routes(routes!(relocate::handler))
        .route("/{id}/live", get(live::handler))
}
