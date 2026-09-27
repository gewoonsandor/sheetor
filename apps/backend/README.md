# sheetor-backend

axum + tokio API for Sheetor: accounts and sign-in (email and password, or OpenID Connect), the song library with folder sharing, and live co-editing over WebSockets. In dev it answers `:4000` and Vite proxies to it; in production it also serves `apps/frontend/dist` so the whole app is on `:4000`.

## Run

```bash
nix develop                 # rustc, cargo, clippy, rustfmt, rust-analyzer, cargo-watch, sqlx-cli, postgres
cargo run                   # from anywhere in the repo
cargo watch -q -c -w apps/backend -x run   # what `npm run dev:backend` does
```

- `/api/v1/system/health`
- `/api/v1/users/{create,login,logout,me,me/name}` — accounts and the session cookie
- `/api/v1/auth/{config,sso/login,sso/callback}` — which sign-in methods exist, and the OIDC flow
- `/api/v1/library` — every folder and song the caller can see
- `/api/v1/folders/…` — create, rename, move, delete, and shares
- `/api/v1/songs/…` — create, show, duplicate, move, delete, and `/{id}/live`, the WebSocket
- `/docs` — Swagger UI, generated from the handlers (everything except the WebSocket)
- `/docs/openapi.json` — the spec itself

## Layout

| File | Role |
|---|---|
| `src/main.rs` | tracing setup, `TcpListener`, `axum::serve` |
| `src/app.rs` | router assembly; the order of the merges matters |
| `src/config.rs` | `Config::from_env`, the only place env vars are read (besides `DATABASE_URL`) |
| `src/state.rs` | `AppState` (pool, public URL, auth settings, collaboration hub), handed to handlers by the `State` extractor |
| `src/frontend.rs` | `ServeDir` + SPA fallback, mounted only if `dist` exists |
| `src/api/` | `mod.rs` (`/api/v1` nesting, OpenAPI tags, JSON 404), `current_user.rs`, one directory per feature with one file per endpoint |
| `src/services/` | business logic; `access_service.rs` is every permission check |
| `src/collab/` | live editing: rooms, hub, socket session, delayed saves |
| `src/database/` | `schemas/` (row types), `queries/` (all SQL) |
| `src/error/` | one error enum per feature; `#[derive(ApiError)]` is the HTTP mapping |

## Adding an endpoint

1. New file `src/api/<feature>/<endpoint>.rs` with the request/response types and a handler carrying `#[utoipa::path(...)]`. Write paths relative to the feature, e.g. `path = "/{id}"`, never `/api/v1/…`.
2. Register it in the feature's `mod.rs` with `.routes(routes!(endpoint::handler))`. A new feature also needs `.nest("/<feature>", <feature>::router())` and a `tag` in `ApiDoc` in `src/api/mod.rs`.
3. The handler calls one service; the service checks access with `access_service` and uses `database/queries`.

`routes!` reads the `#[utoipa::path]` attribute, so the route and its documentation cannot drift apart. Nothing is validated at runtime — the handler's return type is the contract. After changing any query, run `cargo sqlx prepare --workspace -- --all-targets` so the offline data the Docker build uses stays current.

## Environment

| Var | Default |
|---|---|
| `PORT` | `4000` |
| `HOST` | `0.0.0.0` |
| `LOG_LEVEL` | `info` (`RUST_LOG` overrides it, e.g. `RUST_LOG=sheetor_backend=debug,tower_http=debug`) |
| `FRONTEND_DIST_DIR` | `apps/frontend/dist`, resolved at compile time from `CARGO_MANIFEST_DIR` |
| `DATABASE_URL` | required; the dev shell exports it |
| `PUBLIC_URL` | `http://localhost:<PORT>` (dev shell: `http://localhost:5173`) |
| `COOKIE_SECURE` | `true` |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISPLAY_NAME` | SSO off unless the issuer is set |
| `LOCAL_AUTH_ENABLED` | `true` |

The root `README.md` explains each of these.
