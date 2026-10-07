#[derive(Debug, thiserror::Error)]
pub enum CollabError {
    #[error("undecodable update: {0}")]
    Decode(#[from] yrs::encoding::read::Error),

    #[error("update does not apply: {0}")]
    Apply(#[from] yrs::error::UpdateError),

    #[error("the document is not a song")]
    InvalidSong,

    #[error("viewers cannot edit")]
    NotEditor,

    #[error("the room is full")]
    RoomFull,

    #[error("the document has reached its size limit")]
    TooLarge,
}
