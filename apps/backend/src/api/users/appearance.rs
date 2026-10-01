use axum::Json;
use axum::extract::State;

use crate::api::current_user::CurrentUser;
use crate::database::schemas::appearance::Appearance;
use crate::error::users::AppearanceError;
use crate::services::user_service;
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/me/appearance",
    tag = "users",
    summary = "The signed-in user's saved appearance",
    responses(
        (status = 200, description = "The saved appearance; null before the first save", body = Option<Appearance>),
        (status = 401, description = "No session"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> Result<Json<Option<Appearance>>, AppearanceError> {
    Ok(Json(user_service::appearance(&state.db, user.id).await?))
}
