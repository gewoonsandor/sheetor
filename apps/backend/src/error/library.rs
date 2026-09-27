use api_error::ApiError;

use super::collab::CollabError;

#[derive(Debug, thiserror::Error, ApiError)]
pub enum LibraryError {
    #[error("sign in first")]
    #[api_error(status_code = 401, message(inherit))]
    Unauthenticated,

    #[error("not found")]
    #[api_error(status_code = 404, message(inherit))]
    NotFound,

    #[error("you do not have permission to do that")]
    #[api_error(status_code = 403, message(inherit))]
    Forbidden,

    #[error("names must be 1 to 120 characters")]
    #[api_error(status_code = 400, message(inherit))]
    InvalidName,

    #[error("items can only move within their owner's library")]
    #[api_error(status_code = 400, message(inherit))]
    CrossOwner,

    #[error("a folder cannot move into itself")]
    #[api_error(status_code = 400, message(inherit))]
    Cycle,

    #[error("not a valid song document")]
    #[api_error(status_code = 400, message(inherit))]
    InvalidSong,

    #[error("no account uses that email")]
    #[api_error(status_code = 404, message(inherit))]
    UnknownUser,

    #[error("you already own this folder")]
    #[api_error(status_code = 400, message(inherit))]
    ShareWithSelf,

    #[error("a share role must be viewer or editor")]
    #[api_error(status_code = 400, message(inherit))]
    OwnerRole,

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

impl From<CollabError> for LibraryError {
    fn from(_: CollabError) -> Self {
        LibraryError::InvalidSong
    }
}
