use axum_login::login_required;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::services::auth_service::Backend;
use crate::state::AppState;

mod appearance;
mod create;
mod login;
mod logout;
mod me;
mod rename;
mod save_appearance;

pub fn router() -> OpenApiRouter<AppState> {
    // `route_layer` applies to the routes registered before it, so the guarded
    // ones go first. Registering `/create` or `/login` above the layer would
    // demand a session to obtain a session.
    OpenApiRouter::new()
        .routes(routes!(me::handler))
        .routes(routes!(rename::handler))
        .routes(routes!(appearance::handler, save_appearance::handler))
        .route_layer(login_required!(Backend))
        .routes(routes!(create::handler))
        .routes(routes!(login::handler))
        .routes(routes!(logout::handler))
}
