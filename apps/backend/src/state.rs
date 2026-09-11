use std::time::Instant;

use sqlx::PgPool;

/// Handed to every handler by the `State` extractor.
///
/// This used to be `Copy`. A `PgPool` cannot be, but it is an `Arc` internally,
/// so cloning one per request only bumps a refcount - that is the intended way
/// to share a pool, and it is why there is no `Arc<AppState>` here.
#[derive(Clone, Debug)]
pub struct AppState {
    pub started_at: Instant,
    pub db: PgPool,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            started_at: Instant::now(),
            db,
        }
    }
}
