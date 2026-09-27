use openidconnect::core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata};
use openidconnect::{
    AuthorizationCode, ClientId, ClientSecret, CsrfToken, EndpointMaybeSet, EndpointNotSet,
    EndpointSet, IssuerUrl, Nonce, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope,
    TokenResponse,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::database::queries::users;
use crate::database::schemas::users::User;
use crate::error::sso::SsoError;
use crate::state::Sso;

pub const PROVIDER: &str = "oidc";
pub const PENDING_KEY: &str = "sso.pending";

const MAX_USERNAME: usize = 64;

/// The secrets of a started sign-in, kept in the session until the provider redirects back.
#[derive(Serialize, Deserialize)]
pub struct PendingLogin {
    csrf: String,
    nonce: String,
    verifier: String,
}

pub struct Identity {
    pub subject: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub name: Option<String>,
}

type OidcClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

/// Returns the provider URL to send the browser to, and what to remember until it returns.
pub async fn begin(sso: &Sso) -> Result<(String, PendingLogin), SsoError> {
    let client = client(sso).await?;
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, csrf, nonce) = client
        .authorize_url(
            CoreAuthenticationFlow::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("email".to_owned()))
        .add_scope(Scope::new("profile".to_owned()))
        .set_pkce_challenge(challenge)
        .url();

    let pending = PendingLogin {
        csrf: csrf.into_secret(),
        nonce: nonce.secret().clone(),
        verifier: verifier.into_secret(),
    };
    Ok((url.to_string(), pending))
}

/// Checks the provider's answer against the pending login and returns who signed in.
pub async fn complete(
    sso: &Sso,
    pending: PendingLogin,
    code: String,
    state: String,
) -> Result<Identity, SsoError> {
    if CsrfToken::new(state) != CsrfToken::new(pending.csrf) {
        return Err(SsoError::StateMismatch);
    }
    let client = client(sso).await?;
    let tokens = client
        .exchange_code(AuthorizationCode::new(code))
        .map_err(|error| SsoError::Exchange(error.to_string()))?
        .set_pkce_verifier(PkceCodeVerifier::new(pending.verifier))
        .request_async(&sso.http)
        .await
        .map_err(|error| SsoError::Exchange(format!("{error:?}")))?;

    let id_token = tokens
        .id_token()
        .ok_or_else(|| SsoError::Token("no id token".to_owned()))?;
    let claims = id_token
        .claims(&client.id_token_verifier(), &Nonce::new(pending.nonce))
        .map_err(|error| SsoError::Token(error.to_string()))?;

    Ok(Identity {
        subject: claims.subject().to_string(),
        email: claims.email().map(|email| email.to_string()),
        email_verified: claims.email_verified().unwrap_or(false),
        name: claims
            .preferred_username()
            .map(|name| name.to_string())
            .or_else(|| claims.name()?.get(None).map(|name| name.to_string())),
    })
}

/// The account for an identity: the one already linked to it, else the account with its
/// verified email, else a new one. An unverified address never links to an existing
/// account, because anyone can claim any address at a provider that does not verify.
pub async fn resolve_user(pool: &PgPool, identity: Identity) -> Result<User, SsoError> {
    if let Some(user) = users::find_user_by_identity(pool, PROVIDER, &identity.subject).await? {
        return Ok(user);
    }
    let email = identity.email.as_deref().ok_or(SsoError::NoEmail)?;
    if identity.email_verified
        && let Some(user) = users::link_identity(pool, email, PROVIDER, &identity.subject).await?
    {
        return Ok(user);
    }
    let name = display_name(&identity, email);
    users::insert_sso_user(pool, &name, email, PROVIDER, &identity.subject).await
}

async fn client(sso: &Sso) -> Result<OidcClient, SsoError> {
    let issuer = IssuerUrl::new(sso.config.issuer_url.clone())
        .map_err(|error| SsoError::Discovery(error.to_string()))?;
    let redirect = RedirectUrl::new(sso.redirect_url.clone())
        .map_err(|error| SsoError::Discovery(error.to_string()))?;
    let metadata = CoreProviderMetadata::discover_async(issuer, &sso.http)
        .await
        .map_err(|error| SsoError::Discovery(format!("{error:?}")))?;

    Ok(CoreClient::from_provider_metadata(
        metadata,
        ClientId::new(sso.config.client_id.clone()),
        Some(ClientSecret::new(sso.config.client_secret.clone())),
    )
    .set_redirect_uri(redirect))
}

fn display_name(identity: &Identity, email: &str) -> String {
    let local_part = email.split('@').next().unwrap_or_default();
    let name = identity.name.as_deref().unwrap_or(local_part).trim();
    if name.is_empty() {
        return "Musician".to_owned();
    }
    name.chars().take(MAX_USERNAME).collect()
}
