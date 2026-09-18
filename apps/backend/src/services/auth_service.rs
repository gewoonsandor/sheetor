use axum_login::{AuthUser, AuthnBackend, UserId};
use serde::Deserialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::database::queries::users::{find_user_by_email, find_user_by_id};
use crate::database::schemas::users::User;
use crate::error::auth::AuthError;
use crate::helpers::users::password::verify_password;

impl AuthUser for User {
    type Id = i32;

    fn id(&self) -> Self::Id {
        self.id
    }

    /// The stored hash doubles as the session's validity token: change a
    /// password and every session already issued stops verifying. A provider
    /// account has no local hash, so its sessions are keyed on the empty
    /// string and a provider-side change does not invalidate them.
    fn session_auth_hash(&self) -> &[u8] {
        self.password_hash.as_deref().unwrap_or_default().as_bytes()
    }
}

#[derive(Clone, Deserialize, ToSchema)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

/// The email is the identity - it is the column carrying `UNIQUE`. A username
/// is a display name and several users may share one.
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
        let Some(user) = find_user_by_email(&self.db, &creds.email).await? else {
            return Ok(None);
        };

        // A provider-only account has no local password, so no password may
        // authenticate it - including an empty one.
        let Some(hash) = user.password_hash.clone() else {
            return Ok(None);
        };

        // argon2 verification is deliberately expensive, so it cannot run on a
        // runtime thread: a burst of logins would stall every other request.
        let matched = tokio::task::spawn_blocking(move || verify_password(&creds.password, &hash))
            .await
            .map_err(|_| AuthError::HashTaskFailed)?;

        Ok(matched.then_some(user))
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<User>, Self::Error> {
        Ok(find_user_by_id(&self.db, *user_id).await?)
    }
}

pub type AuthSession = axum_login::AuthSession<Backend>;
