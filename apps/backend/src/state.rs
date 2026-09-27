use std::time::Instant;

use openidconnect::reqwest;
use sqlx::PgPool;

use crate::config::{Config, SsoConfig};

/// Handed to every handler by the `State` extractor.
///
/// This used to be `Copy`. A `PgPool` cannot be, but it is an `Arc` internally,
/// so cloning one per request only bumps a refcount - that is the intended way
/// to share a pool, and it is why there is no `Arc<AppState>` here.
#[derive(Clone)]
pub struct AppState {
    pub started_at: Instant,
    pub db: PgPool,
    pub public_url: String,
    pub auth: AuthSettings,
}

impl AppState {
    pub fn new(db: PgPool, public_url: String, auth: AuthSettings) -> Self {
        Self {
            started_at: Instant::now(),
            db,
            public_url,
            auth,
        }
    }
}

#[derive(Clone)]
pub struct AuthSettings {
    pub local_enabled: bool,
    pub sso: Option<Sso>,
}

#[derive(Clone)]
pub struct Sso {
    pub config: SsoConfig,
    pub redirect_url: String,
    pub http: reqwest::Client,
}

impl AuthSettings {
    pub fn from_config(config: &Config) -> Self {
        Self {
            local_enabled: config.local_auth_enabled,
            sso: config
                .sso
                .clone()
                .map(|sso| Sso::new(sso, &config.public_url)),
        }
    }

    pub fn local_only() -> Self {
        Self {
            local_enabled: true,
            sso: None,
        }
    }
}

impl Sso {
    fn new(config: SsoConfig, public_url: &str) -> Self {
        let http = reqwest::ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("build the OIDC http client");

        Self {
            config,
            redirect_url: format!("{public_url}/api/v1/auth/sso/callback"),
            http,
        }
    }
}
