use axum::Json;
use axum::extract::State;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::appearance::Appearance;
use crate::error::users::AppearanceError;
use crate::services::user_service;
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/me/appearance",
    tag = "users",
    summary = "Saves the signed-in user's appearance",
    request_body = Appearance,
    responses(
        (status = 200, description = "Saved", body = Appearance),
        (status = 401, description = "No session"),
        (status = 422, description = "Unknown theme or colour style"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(appearance): Json<Appearance>,
) -> Result<Json<Appearance>, AppearanceError> {
    let saved = user_service::save_appearance(&state.db, user.id, appearance).await?;
    Ok(Json(saved))
}
