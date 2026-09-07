use std::env;
use std::path::PathBuf;

const DEFAULT_FRONTEND_DIST_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/dist");

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub frontend_dist_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: var_or("HOST", "0.0.0.0"),
            port: env::var("PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .filter(|port| *port > 0)
                .unwrap_or(4000),
            log_level: var_or("LOG_LEVEL", "info"),
            frontend_dist_dir: PathBuf::from(var_or(
                "FRONTEND_DIST_DIR",
                DEFAULT_FRONTEND_DIST_DIR,
            )),
        }
    }
}

fn var_or(key: &str, fallback: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}
