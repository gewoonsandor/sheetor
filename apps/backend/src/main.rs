use std::io;

use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

use sheetor_backend::config::Config;
use sheetor_backend::{app, database};

#[tokio::main]
async fn main() -> io::Result<()> {
    let config = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(config.log_level.as_str())),
        )
        .init();

    // Before the listener: a process that cannot reach its database should
    // fail at boot, not on the first request that needs one.
    let db = database::init_pool().await;

    let listener = TcpListener::bind((config.host.as_str(), config.port)).await?;
    tracing::info!("listening on http://{}", listener.local_addr()?);
    tracing::info!("swagger ui on http://{}/docs", listener.local_addr()?);

    axum::serve(listener, app::build(&config, db).await).await
}
