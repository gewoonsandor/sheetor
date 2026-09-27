//! The service as a library, so `tests/` can drive it.
//!
//! A crate with only `main.rs` cannot be imported by an integration test -
//! there is nothing to `use`. Everything therefore lives here, and `main.rs`
//! is only the process entry point: read config, open the pool, serve.

pub mod api;
pub mod app;
pub mod collab;
pub mod config;
pub mod database;
pub mod error;
pub mod frontend;
pub mod helpers;
pub mod services;
pub mod state;
