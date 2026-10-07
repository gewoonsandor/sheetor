use std::fs;

use axum::Router;
use axum::http::HeaderValue;
use axum::http::header::CONTENT_SECURITY_POLICY;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha256};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::config::Config;

/// Installs the SPA fallback when the build is there, and puts the Content-Security-Policy
/// on everything `router` and the fallback answer.
pub fn serve(router: Router, config: &Config) -> Router {
    let index = config.frontend_dist_dir.join("index.html");
    let Ok(html) = fs::read_to_string(&index) else {
        tracing::warn!(
            dir = %config.frontend_dist_dir.display(),
            "frontend build missing, serving api only",
        );
        return router.layer(csp_layer("", &config.public_url));
    };

    router
        .fallback_service(ServeDir::new(&config.frontend_dist_dir).fallback(ServeFile::new(index)))
        .layer(csp_layer(&html, &config.public_url))
}

fn csp_layer(index_html: &str, public_url: &str) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::if_not_present(
        CONTENT_SECURITY_POLICY,
        content_security_policy(index_html, public_url),
    )
}

/// Scripts only from this origin, plus the inline ones `index.html` carries, by hash: read
/// from the served file at boot, so the policy follows every rebuild. Styles allow inline,
/// which React's `style` props need.
pub fn content_security_policy(index_html: &str, public_url: &str) -> HeaderValue {
    let inline_scripts: String = inline_scripts(index_html)
        .map(|script| format!(" 'sha256-{}'", STANDARD.encode(Sha256::digest(script))))
        .collect();
    // `'self'` covers ws: in current browsers only; the live socket is named for the rest.
    let socket = public_url.replacen("http", "ws", 1);
    let policy = format!(
        "default-src 'self'; script-src 'self'{inline_scripts}; \
         style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
         font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; \
         connect-src 'self' {socket}; frame-ancestors 'none'; base-uri 'none'; \
         form-action 'self'"
    );
    HeaderValue::from_str(&policy).expect("PUBLIC_URL fits in a header")
}

/// The bodies of the `<script>` elements without a `src`.
fn inline_scripts(html: &str) -> impl Iterator<Item = &str> {
    html.split("<script").skip(1).filter_map(|element| {
        let (attributes, rest) = element.split_once('>')?;
        let (body, _) = rest.split_once("</script>")?;
        (!attributes.contains("src=")).then_some(body)
    })
}
