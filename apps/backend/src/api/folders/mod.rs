use utoipa_axum::{router::OpenApiRouter, routes};

use crate::state::AppState;

mod create;
mod relocate;
mod remove;
mod rename;
mod share;
mod shares;
mod unshare;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create::handler))
        .routes(routes!(remove::handler))
        .routes(routes!(rename::handler))
        .routes(routes!(relocate::handler))
        .routes(routes!(shares::handler, share::handler))
        .routes(routes!(unshare::handler))
}
