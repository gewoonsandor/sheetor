use axum::Json;
use axum::extract::State;
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct AuthConfig {
    local_enabled: bool,
    /// The provider's button label, or `null` when single sign-on is off.
    sso_name: Option<String>,
}

#[utoipa::path(
    get,
    path = "/config",
    tag = "auth",
    summary = "Which sign-in methods the sign-in page should offer",
    responses((status = 200, description = "Sign-in options", body = AuthConfig)),
)]
pub async fn handler(State(state): State<AppState>) -> Json<AuthConfig> {
    Json(AuthConfig {
        local_enabled: state.auth.local_enabled,
        sso_name: state
            .auth
            .sso
            .as_ref()
            .map(|sso| sso.config.display_name.clone()),
    })
}
