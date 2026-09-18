use axum_login::login_required;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::services::auth_service::Backend;
use crate::state::AppState;

mod create;
mod login;
mod logout;
mod me;

pub fn router() -> OpenApiRouter<AppState> {
    // `route_layer` applies to the routes registered before it, so the guarded
    // ones go first. Registering `/create` or `/login` above the layer would
    // demand a session to obtain a session.
    OpenApiRouter::new()
        .routes(routes!(me::handler))
        .route_layer(login_required!(Backend))
        .routes(routes!(create::handler))
        .routes(routes!(login::handler))
        .routes(routes!(logout::handler))
}
