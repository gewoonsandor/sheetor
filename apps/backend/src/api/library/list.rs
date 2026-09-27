use axum::Json;
use axum::extract::State;

use crate::api::current_user::CurrentUser;
use crate::error::library::LibraryError;
use crate::services::library_service::{self, Library};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/library",
    tag = "library",
    summary = "Every folder and song the signed-in user can see",
    responses(
        (status = 200, description = "The library", body = Library),
        (status = 401, description = "No session"),
    ),
)]
pub async fn handler(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> Result<Json<Library>, LibraryError> {
    Ok(Json(library_service::list(&state.db, user.id).await?))
}
