use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use openidconnect::core::CoreProviderMetadata;
use openidconnect::reqwest;
use sqlx::PgPool;

use crate::collab::hub::Hub;
use crate::config::{Config, SsoConfig};
use crate::services::auth_service::AuthLimits;

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
    pub collab: Hub,
    pub limits: Arc<AuthLimits>,
}

impl AppState {
    pub fn new(db: PgPool, public_url: String, auth: AuthSettings) -> Self {
        Self {
            started_at: Instant::now(),
            db,
            public_url,
            auth,
            collab: Hub::default(),
            limits: Arc::default(),
        }
    }
}

#[derive(Clone)]
pub struct AuthSettings {
    pub local_enabled: bool,
    /// Whether the client address is the last one in X-Forwarded-For (`auth_service::client_ip`).
    pub trust_proxy: bool,
    pub sso: Option<Sso>,
}

#[derive(Clone)]
pub struct Sso {
    pub config: SsoConfig,
    pub redirect_url: String,
    pub http: reqwest::Client,
    /// The provider's discovery document and when it was fetched (`sso_service::metadata`).
    pub metadata: Arc<Mutex<Option<(Instant, CoreProviderMetadata)>>>,
}

impl AuthSettings {
    pub fn from_config(config: &Config) -> Self {
        Self {
            local_enabled: config.local_auth_enabled,
            trust_proxy: config.trust_proxy,
            sso: config
                .sso
                .clone()
                .map(|sso| Sso::new(sso, &config.public_url)),
        }
    }

    pub fn local_only() -> Self {
        Self {
            local_enabled: true,
            trust_proxy: false,
            sso: None,
        }
    }
}

impl Sso {
    fn new(config: SsoConfig, public_url: &str) -> Self {
        // A provider that stops answering must not hold sign-in requests open forever.
        let http = reqwest::ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .expect("build the OIDC http client");

        Self {
            config,
            redirect_url: format!("{public_url}/api/v1/auth/sso/callback"),
            http,
            metadata: Arc::default(),
        }
    }
}
