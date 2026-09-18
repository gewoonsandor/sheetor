use api_error::ApiError;

#[derive(Debug, thiserror::Error, ApiError)]
pub enum AuthError {
    /// Deliberately the same answer for an address that does not exist and a
    /// password that does not match, so the response cannot be used to probe
    /// which addresses are registered.
    #[error("invalid email or password")]
    #[api_error(status_code = 401, message(inherit))]
    InvalidCredentials,

    #[error("password verification task failed")]
    HashTaskFailed,

    #[error("session store failure")]
    Session,

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}
