use api_error::ApiError;

#[derive(Debug, thiserror::Error, ApiError)]
pub enum InsertUserError {
    #[error("sign-in with email and password is disabled")]
    #[api_error(status_code = 403, message(inherit))]
    LocalDisabled,

    #[error("password does not meet requirements")]
    #[api_error(status_code = 400, message(inherit))]
    BadPassWord,

    #[error("email already registered")]
    #[api_error(status_code = 409, message(inherit))]
    EmailTaken,

    #[error("password hashing task failed")]
    HashTaskFailed,

    #[error("failed to hash password")]
    PasswordHash(#[from] argon2::password_hash::Error),

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, thiserror::Error, ApiError)]
pub enum UpdateUserError {
    #[error("display names must be 1 to 64 characters")]
    #[api_error(status_code = 400, message(inherit))]
    InvalidUsername,

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, thiserror::Error, ApiError)]
pub enum AppearanceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}
