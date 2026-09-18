use std::env;
use std::path::PathBuf;

const DEFAULT_FRONTEND_DIST_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/dist");

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub frontend_dist_dir: PathBuf,
    /// `Secure` on the session cookie. Defaults to on, so a deployment is
    /// safe by default; set `COOKIE_SECURE=false` to test over plain http,
    /// where curl (unlike a browser on localhost) refuses to send it.
    pub cookie_secure: bool,
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
            cookie_secure: var_or("COOKIE_SECURE", "true") != "false",
        }
    }
}

fn var_or(key: &str, fallback: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}
