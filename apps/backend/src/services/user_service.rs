use crate::database::queries::appearance::{find_appearance, upsert_appearance};
use crate::database::queries::users::{insert_user, update_username};
use crate::database::schemas::appearance::Appearance;
use crate::database::schemas::users::User;
use crate::error::users::{AppearanceError, InsertUserError, UpdateUserError};
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

pub async fn rename(pool: &PgPool, id: i32, username: &str) -> Result<User, UpdateUserError> {
    let username = username.trim();
    if !(1..=64).contains(&username.chars().count()) {
        return Err(UpdateUserError::InvalidUsername);
    }
    Ok(update_username(pool, id, username).await?)
}

pub async fn appearance(pool: &PgPool, id: i32) -> Result<Option<Appearance>, AppearanceError> {
    Ok(find_appearance(pool, id).await?)
}

pub async fn save_appearance(
    pool: &PgPool,
    id: i32,
    appearance: Appearance,
) -> Result<Appearance, AppearanceError> {
    Ok(upsert_appearance(pool, id, appearance).await?)
}
