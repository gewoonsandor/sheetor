use api_error::ApiError;

#[derive(Debug, thiserror::Error, ApiError)]
pub enum AuthError {
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
