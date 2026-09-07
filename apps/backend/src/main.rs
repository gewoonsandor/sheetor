mod api;
mod app;
mod config;
mod frontend;
mod state;

use std::io;

use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

use crate::config::Config;

#[tokio::main]
async fn main() -> io::Result<()> {
    let config = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(config.log_level.as_str())),
        )
        .init();

    let listener = TcpListener::bind((config.host.as_str(), config.port)).await?;
    tracing::info!("listening on http://{}", listener.local_addr()?);
    tracing::info!("swagger ui on http://{}/docs", listener.local_addr()?);

    axum::serve(listener, app::build(&config)).await
}
