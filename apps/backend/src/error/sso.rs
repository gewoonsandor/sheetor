use api_error::ApiError;

/// Only `NotConfigured` ever reaches a client as JSON; the callback turns every
/// other variant into a redirect carrying `code()`.
#[derive(Debug, thiserror::Error, ApiError)]
pub enum SsoError {
    #[error("single sign-on is not configured")]
    #[api_error(status_code = 404, message(inherit))]
    NotConfigured,

    #[error("provider discovery failed: {0}")]
    Discovery(String),

    #[error("code exchange failed: {0}")]
    Exchange(String),

    #[error("id token rejected: {0}")]
    Token(String),

    #[error("state does not match the pending login")]
    StateMismatch,

    #[error("no pending login in this session")]
    MissingPending,

    #[error("the provider did not share an email address")]
    NoEmail,

    #[error("an unlinked account already uses this email")]
    EmailTaken,

    #[error("session store failure")]
    Session,

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

impl SsoError {
    /// The `sso_error` value the sign-in page understands.
    pub fn code(&self) -> &'static str {
        match self {
            SsoError::NoEmail => "no_email",
            SsoError::EmailTaken => "email_taken",
            SsoError::NotConfigured => "not_configured",
            _ => "failed",
        }
    }
}
