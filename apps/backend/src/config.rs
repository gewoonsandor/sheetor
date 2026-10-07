use std::env;
use std::path::PathBuf;

const DEFAULT_FRONTEND_DIST_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/dist");

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub frontend_dist_dir: PathBuf,
    pub cookie_secure: bool,
    pub public_url: String,
    pub local_auth_enabled: bool,
    pub docs_enabled: bool,
    pub trust_proxy: bool,
    pub sso: Option<SsoConfig>,
}

#[derive(Clone, Debug)]
pub struct SsoConfig {
    pub issuer_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub display_name: String,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .filter(|port| *port > 0)
            .unwrap_or(4000);
        let sso = SsoConfig::from_env();

        Self {
            host: var_or("HOST", "0.0.0.0"),
            port,
            log_level: var_or("LOG_LEVEL", "info"),
            frontend_dist_dir: PathBuf::from(var_or(
                "FRONTEND_DIST_DIR",
                DEFAULT_FRONTEND_DIST_DIR,
            )),
            cookie_secure: var_or("COOKIE_SECURE", "true") != "false",
            public_url: var_or("PUBLIC_URL", &format!("http://localhost:{port}"))
                .trim_end_matches('/')
                .to_owned(),
            // Turning local sign-in off without a provider would lock everyone out.
            local_auth_enabled: var_or("LOCAL_AUTH_ENABLED", "true") != "false" || sso.is_none(),
            docs_enabled: var_or("DOCS_ENABLED", "false") == "true",
            trust_proxy: var_or("TRUST_PROXY", "false") == "true",
            sso,
        }
    }
}

impl SsoConfig {
    fn from_env() -> Option<Self> {
        let issuer_url = env::var("OIDC_ISSUER_URL")
            .ok()
            .filter(|url| !url.is_empty())?;

        Some(Self {
            issuer_url,
            client_id: env::var("OIDC_CLIENT_ID")
                .expect("OIDC_CLIENT_ID is required when OIDC_ISSUER_URL is set"),
            client_secret: env::var("OIDC_CLIENT_SECRET")
                .expect("OIDC_CLIENT_SECRET is required when OIDC_ISSUER_URL is set"),
            display_name: var_or("OIDC_DISPLAY_NAME", "Single sign-on"),
        })
    }
}

fn var_or(key: &str, fallback: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}
