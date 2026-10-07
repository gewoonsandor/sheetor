use std::collections::HashMap;
use std::hash::Hash;
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroUsize;
use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::{Duration, Instant};

use axum::http::HeaderMap;
use axum_login::{AuthUser, AuthnBackend, UserId};
use serde::Deserialize;
use sqlx::PgPool;
use tokio::sync::Semaphore;
use utoipa::ToSchema;

use crate::database::queries::users::{find_user_by_email, find_user_by_id};
use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::helpers::users::password::{hash_password, verify_password};
use crate::services::user_service::{MAX_EMAIL, normalize_email};

/// One argon2 run is ~50 ms of CPU and 19 MiB, so at most one per core runs at a time: a
/// burst of sign-ins queues here instead of exhausting memory and the blocking pool.
static ARGON2: LazyLock<Semaphore> = LazyLock::new(|| {
    let cores = std::thread::available_parallelism().map_or(2, NonZeroUsize::get);
    Semaphore::new(cores.max(2))
});
/// How long a request waits for its argon2 turn before the server answers 503.
const ARGON2_WAIT: Duration = Duration::from_secs(5);

/// Verified against when the account is missing or has no password, so a refusal takes as
/// long either way and the response time does not tell which addresses have an account.
static DUMMY_HASH: LazyLock<String> =
    LazyLock::new(|| hash_password("no account has this password").expect("hash the dummy"));

impl AuthUser for User {
    type Id = i32;

    fn id(&self) -> Self::Id {
        self.id
    }

    fn session_auth_hash(&self) -> &[u8] {
        self.password_hash.as_deref().unwrap_or_default().as_bytes()
    }
}

#[derive(Clone, Deserialize, ToSchema)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

#[derive(Clone, Debug)]
pub struct Backend {
    db: PgPool,
}

impl Backend {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }
}

impl AuthnBackend for Backend {
    type User = User;
    type Credentials = Credentials;
    type Error = AuthError;

    async fn authenticate(&self, creds: Credentials) -> Result<Option<User>, Self::Error> {
        let user = find_user_by_email(&self.db, &normalize_email(&creds.email)).await?;
        let hash = user.as_ref().and_then(|user| user.password_hash.clone());

        let matched = run_argon2(
            move || {
                let stored = hash.as_deref().unwrap_or(DUMMY_HASH.as_str());
                verify_password(&creds.password, stored) && hash.is_some()
            },
            AuthError::Busy,
            AuthError::HashTaskFailed,
        )
        .await?;

        Ok(user.filter(|_| matched))
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<User>, Self::Error> {
        Ok(find_user_by_id(&self.db, *user_id).await?)
    }
}

pub type AuthSession = axum_login::AuthSession<Backend>;

/// Signs a user in with a password, unless this client or this address has had too many
/// tries, and issues the session a fresh id.
pub async fn login(
    auth_session: &mut AuthSession,
    limits: &AuthLimits,
    client: IpAddr,
    creds: Credentials,
) -> Result<User, AuthError> {
    if !limits.login_by_ip.attempt(client) {
        return Err(AuthError::TooManyAttempts);
    }
    let email = normalize_email(&creds.email);
    // No account has a longer address, and keying the limit on one would let a client
    // park megabytes in it.
    if email.chars().count() > MAX_EMAIL {
        return Err(AuthError::InvalidCredentials);
    }
    if !limits.login_by_email.attempt(email.clone()) {
        return Err(AuthError::TooManyAttempts);
    }

    let user = auth_session
        .authenticate(creds)
        .await
        .map_err(unwrap_session_error)?
        .ok_or(AuthError::InvalidCredentials)?;
    limits.login_by_email.clear(&email);

    // axum-login only cycles the id of a session nobody is signed in to.
    auth_session.session.cycle_id().await.map_err(|error| {
        tracing::error!(?error, "session store failure");
        AuthError::Session
    })?;
    auth_session
        .login(&user)
        .await
        .map_err(unwrap_session_error)?;
    Ok(user)
}

fn unwrap_session_error(error: axum_login::Error<Backend>) -> AuthError {
    match error {
        axum_login::Error::Backend(error) => error,
        axum_login::Error::Session(error) => {
            tracing::error!(?error, "session store failure");
            AuthError::Session
        }
    }
}

/// Runs one argon2 hash or verification on the blocking pool once it gets a turn: `busy`
/// when none comes within `ARGON2_WAIT`, `failed` when the task panics.
pub async fn run_argon2<T, E>(
    work: impl FnOnce() -> T + Send + 'static,
    busy: E,
    failed: E,
) -> Result<T, E>
where
    T: Send + 'static,
{
    let Ok(Ok(permit)) = tokio::time::timeout(ARGON2_WAIT, ARGON2.acquire()).await else {
        return Err(busy);
    };
    // The permit goes with the task: a request dropped mid-hash must not free the turn
    // while its hash still runs.
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    })
    .await
    .map_err(|_| failed)
}

/// The address the per-client limits count: the TCP peer, or behind a trusted proxy
/// (`TRUST_PROXY`) the last X-Forwarded-For entry, the one that proxy appended; the
/// entries before it are whatever the client sent. Falls back to the peer when the header
/// is missing or unreadable.
pub fn client_ip(headers: &HeaderMap, peer: SocketAddr, trust_proxy: bool) -> IpAddr {
    let forwarded = || {
        let last = headers.get_all("x-forwarded-for").iter().next_back()?;
        last.to_str().ok()?.rsplit(',').next()?.trim().parse().ok()
    };
    trust_proxy.then(forwarded).flatten().unwrap_or(peer.ip())
}

/// How often sign-in and sign-up may be tried.
pub struct AuthLimits {
    pub login_by_email: RateLimiter<String>,
    pub login_by_ip: RateLimiter<IpAddr>,
    pub signup_by_ip: RateLimiter<IpAddr>,
}

impl Default for AuthLimits {
    fn default() -> Self {
        const FIFTEEN_MINUTES: Duration = Duration::from_secs(15 * 60);
        Self {
            login_by_email: RateLimiter::new(5, FIFTEEN_MINUTES),
            login_by_ip: RateLimiter::new(20, FIFTEEN_MINUTES),
            signup_by_ip: RateLimiter::new(10, Duration::from_secs(60 * 60)),
        }
    }
}

/// At most `max` attempts per key in a window that opens with the key's first attempt.
// ponytail: in memory, per process, like the collab hub; expired windows are pruned once
// per window, so a flood from many addresses grows the map for one window at most. Move
// the counts to a shared store once the backend runs as more than one instance.
pub struct RateLimiter<K> {
    max: u32,
    window: Duration,
    state: Mutex<Windows<K>>,
}

struct Windows<K> {
    pruned: Instant,
    open: HashMap<K, (Instant, u32)>,
}

impl<K: Hash + Eq> RateLimiter<K> {
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            max,
            window,
            state: Mutex::new(Windows {
                pruned: Instant::now(),
                open: HashMap::new(),
            }),
        }
    }

    /// Counts one attempt for `key`, or refuses it when the key's window is used up.
    pub fn attempt(&self, key: K) -> bool {
        let now = Instant::now();
        let window = self.window;
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        if now.duration_since(state.pruned) >= window {
            state
                .open
                .retain(|_, (opened, _)| now.duration_since(*opened) < window);
            state.pruned = now;
        }

        let entry = state.open.entry(key).or_insert((now, 0));
        if now.duration_since(entry.0) >= window {
            *entry = (now, 0);
        }
        if entry.1 >= self.max {
            return false;
        }
        entry.1 += 1;
        true
    }

    /// Forgets `key`'s attempts.
    pub fn clear(&self, key: &K) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.open.remove(key);
    }
}
