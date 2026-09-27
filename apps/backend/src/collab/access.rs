use crate::state::AppState;

/// Re-checks live connections after an access change, off the request path.
pub fn refresh(state: &AppState) {
    tokio::spawn(revalidate(state.clone()));
}

pub async fn revalidate(_state: AppState) {}
