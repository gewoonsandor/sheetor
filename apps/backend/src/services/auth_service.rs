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
        let Some(user) = find_user_by_email(&self.db, &creds.email).await? else {
            return Ok(None);
        };

        let Some(hash) = user.password_hash.clone() else {
            return Ok(None);
        };

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
