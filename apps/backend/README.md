# sheetor-backend

axum + tokio API for Sheetor. In dev it answers `:4000` and Vite proxies to it; in production it also serves `apps/frontend/dist` so the whole app is on `:4000`.

## Run

```bash
nix develop                 # rustc, cargo, clippy, rustfmt, rust-analyzer, cargo-watch
cargo run                   # from anywhere in the repo
cargo watch -q -c -w apps/backend -x run   # what `npm run dev:backend` does
```

- `GET /api/v1/health` — the one endpoint
- `/docs` — Swagger UI, generated from the handlers
- `/docs/openapi.json` — the spec itself

## Layout

| File | Role |
|---|---|
| `src/main.rs` | tracing setup, `TcpListener`, `axum::serve` |
| `src/app.rs` | router assembly; the order of the merges matters |
| `src/config.rs` | `Config::from_env`, the only place env vars are read |
| `src/state.rs` | `AppState`, handed to handlers by the `State` extractor |
| `src/frontend.rs` | `ServeDir` + SPA fallback, mounted only if `dist` exists |
| `src/api/mod.rs` | `/api/v1` nesting, OpenAPI tags, JSON 404 |
| `src/api/health.rs` | the route template to copy |

## Adding an endpoint

1. New file `src/api/songs.rs` with a `#[derive(Serialize, ToSchema)]` response type and a handler carrying `#[utoipa::path(...)]`. Write `path = "/songs"`, not `/api/v1/songs`.
2. In `src/api/mod.rs`: `mod songs;`, add `.routes(routes!(songs::list))` to `v1`, and add a new `tag` to `ApiDoc` if the feature is new.

`routes!` reads the `#[utoipa::path]` attribute, so the route and its documentation cannot drift apart. Nothing is validated at runtime — the handler's return type is the contract.

## Environment

| Var | Default |
|---|---|
| `PORT` | `4000` |
| `HOST` | `0.0.0.0` |
| `LOG_LEVEL` | `info` (`RUST_LOG` overrides it, e.g. `RUST_LOG=sheetor_backend=debug,tower_http=debug`) |
| `FRONTEND_DIST_DIR` | `apps/frontend/dist`, resolved at compile time from `CARGO_MANIFEST_DIR` |
