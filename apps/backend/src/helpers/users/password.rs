use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};
/// Password requirements is:
/// 12 - 128 characters
/// 3 out of 4, Uppercase, lowercase, number, special
pub fn check_password_requirements(password: &str) -> bool {
    if password.len() < 12 {
        return false;
    }
    if password.len() > 128 {
        return false;
    }

    let mut has_upper: i8 = 0;
    let mut has_lower: i8 = 0;
    let mut has_num: i8 = 0;
    let mut has_special: i8 = 0;

    for c in password.chars() {
        if c.is_ascii_uppercase() {
            has_upper = 1;
        } else if c.is_ascii_lowercase() {
            has_lower = 1;
        } else if c.is_ascii_digit() {
            has_num = 1;
        } else {
            has_special = 1;
        }
    }

    has_upper + has_lower + has_num + has_special >= 3
}

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    Ok(Argon2::default()
        .hash_password(password.as_bytes())?
        .to_string())
}

pub fn verify_password(password: &str, stored_pass: &str) -> bool {
    match PasswordHash::new(stored_pass) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}
