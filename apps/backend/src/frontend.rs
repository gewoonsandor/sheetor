use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

use crate::config::Config;

pub fn serve(router: Router, config: &Config) -> Router {
    if !config.frontend_dist_dir.is_dir() {
        tracing::warn!(
            dir = %config.frontend_dist_dir.display(),
            "frontend build missing, serving api only",
        );
        return router;
    }

    let index = ServeFile::new(config.frontend_dist_dir.join("index.html"));
    router.fallback_service(ServeDir::new(&config.frontend_dist_dir).fallback(index))
}
