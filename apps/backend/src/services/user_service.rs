use crate::database::queries::users::insert_user;
use crate::database::schemas::users::User;
use crate::error::users::InsertUserError;
use crate::helpers::users::password::{check_password_requirements, hash_password};
use sqlx::PgPool;

pub async fn create(
    pool: &PgPool,
    username: &str,
    email: &str,
    password: &str,
) -> Result<User, InsertUserError> {
    if !check_password_requirements(password) {
        return Err(InsertUserError::BadPassWord);
    }

    let password = password.to_owned();
    let hashed_password = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(|_| InsertUserError::HashTaskFailed)??;

    insert_user(pool, username, email, &hashed_password).await
}
