# Repository Guidelines

## Project Overview

Sheetor is an interactive guitar TAB + sheet-music editor with in-browser playback. npm-workspaces monorepo:

- `apps/frontend` — React 19 SPA (Vite), the entire product surface.
- `apps/backend` — Rust axum API + Swagger (utoipa), and in production the single user-facing HTTP entry point (it serves the built SPA).

Songs and folders live **on the server**, in PostgreSQL, and nothing renders until the visitor has a server session (email and password, or single sign-on through one OpenID Connect provider). A folder owner shares a folder, with its whole subtree, as *viewer* or *editor*, and everyone with access edits a song **simultaneously**: each song is a Yjs CRDT document synced over a WebSocket, with presence and live cursors. The backend is the REST API (`system`, `users`, `auth`, `library`, `folders`, `songs`), the live-session hub, and the prod SPA host.

## Architecture & Data Flow

### Serving topology

`npm run dev` starts both processes with `concurrently`. In dev the browser talks to **Vite on `http://localhost:5173`**, which proxies `/api` (including WebSocket upgrades, `ws: true`) and `/docs` to axum on `:4000`. In production there is one port: axum serves the built SPA itself on `:4000`. `PUBLIC_URL` must be the origin the browser actually uses — the flake sets `http://localhost:5173` — because the live socket rejects any other `Origin` and the SSO callback URL is built from it.

```mermaid
graph LR
  B[Browser :5173 dev] --> V[Vite :5173]
  V -->|proxy /api, /docs| A[axum apps/backend :4000]
  P[Browser :4000 prod] --> A
  A -->|/api/v1/*| R[api modules]
  A -->|/docs| S[Swagger UI]
  A -->|fallback_service| D[apps/frontend/dist]
```

Static serving is **presence-based, not env-based**: `frontend::serve` mounts `ServeDir` plus an `index.html` SPA fallback only when `frontend_dist_dir` is a directory; otherwise it logs `frontend build missing` and the router stays api-only. There is no `NODE_ENV` switch and no reverse proxy inside Rust.

### Backend boot chain

The crate is a **library plus a thin binary**. `src/lib.rs` declares every module; `src/main.rs` only reads config, opens the pool and serves. That split exists so `apps/backend/tests/` can `use sheetor_backend::…` — an integration test cannot import a bin-only crate — and so `pub` items are public API rather than dead code under `clippy -D warnings`.

`src/main.rs` (config, tracing, `database::init_pool`, `TcpListener`, `axum::serve`) → `src/app.rs` `build(&Config, PgPool).await`, async because the session store creates its own table on the way up. The pool is opened **before** the listener: a process that cannot reach its database should fail at boot, not on the first request. The order inside `build` is **load-bearing**:

1. `PostgresStore::new(db.clone())` then `.migrate()` — creates `tower_sessions.session`.
2. `SessionManagerLayer` (`HttpOnly`, `SameSite=Lax`, `Secure` from `config.cookie_secure`) wrapped by `AuthManagerLayerBuilder` around `auth_service::Backend`. **Lax, not Strict**: the identity provider's redirect back to `/auth/sso/callback` is a cross-site navigation, and a Strict cookie would not carry the pending login. CSRF on the live socket is covered by its `Origin` check instead.
3. `api::router(AppState::new(db, public_url, AuthSettings::from_config(config)))` → the `/api/v1`-nested router plus the collected `OpenApi`. `AppState` also creates the in-memory `collab::Hub`.
4. `/api` and `/api/{*path}` catch-alls → JSON `{"message":"Not Found"}`, so an unknown API path never falls through to the SPA.
5. `SwaggerUi::new("/docs").url("/docs/openapi.json", openapi)`.
6. `.layer(auth_layer)` — above `frontend::serve` on purpose, so the SPA's static assets never touch the session store.
7. `frontend::serve` — installs the SPA `fallback_service`; it must stay last because it claims everything unmatched.
8. `TraceLayer` wraps the finished router.

There is no plugin system: `src/api/<feature>/mod.rs` builds that feature's `OpenApiRouter`, and each endpoint gets its own file beside it (`users/create.rs`, `users/login.rs`) holding the handler with its `#[utoipa::path]`. `src/api/mod.rs` is the only place `/api/v1` and the tag list exist. `route_layer` applies to the routes registered **before** it, so a guarded route goes above `login_required!` and the public ones below — invert it and you need a session to obtain a session. Library handlers instead take `api::current_user::CurrentUser`, an extractor that rejects with 401, and are not behind a route layer. `/library` is **merged**, not nested, so its path is `/library` itself. The WebSocket route `songs/{id}/live` is a plain `.route(...)` and is not in the OpenAPI document.

### Access control and live editing (backend)

- Every folder and song has one `owner_id`. A row in `folder_shares` grants `viewer` or `editor` on that folder **and every descendant**; the SQL function `folder_role(user, folder)` (in the library migration) walks the parent chain and returns the best of `owner`/`editor`/`viewer` or `NULL`. `Role` is an ordered enum, `Viewer < Editor < Owner`.
- `services/access_service.rs` is the only gate: `require_folder`/`require_song` turn "no role" into **404** (existence is not leaked) and "role too low" into **403**. `target_owner(parent)` decides whose library a new or moved item lands in; moves across owners are `CrossOwner`, and a folder move takes a per-owner `pg_advisory_xact_lock` before its cycle check so two concurrent moves cannot build a loop. Deleting a folder never deletes a song: children and songs move up one level (`parent_id` has no cascade on purpose).
- `src/collab/`: `summary.rs` (the only place the server reads a song — `title`, `artist`, `bpm`, counts — out of a Yjs v1 state; the server never builds songs itself), `room.rs` (one open song: its `yrs::Doc` and members), `hub.rs` (every room behind one `std::sync::Mutex`, never held across an `.await`), `session.rs` (one socket: join, read loop, leave), `flush.rs` (save 2 s after the first unsaved update and when the last member leaves), `access.rs` (`refresh`/`revalidate`: after any share, move or delete, re-check every live connection and send `role` or close `4403`), `protocol.rs` (message and close-code types).
- Wire protocol: binary frames are raw Yjs **v1** updates both ways (the first server frame is the full state); text frames are JSON tagged by `type` — server `welcome`/`presence`/`role`, client `cursor`. Close codes: `4400` rejected update, `4403` access lost, `4404` song deleted, `1011` unavailable; clients reconnect on anything else. Updates from a viewer are dropped.
- `yrs` is built with the **`small-client`** feature: npm `yjs` 13 only understands 32-bit client ids.
- The hub is in-memory, so the backend runs as **one instance**; the `// ponytail:` note on `Hub` names the upgrade path.

### Frontend data flow

Mount chain: `index.html#root` → `src/main.tsx` (`createRoot` + `StrictMode`) → `src/App.tsx` (`BrowserRouter`) → `src/app/AuthGate.tsx` → `src/app/layout/AppLayout.tsx` → `src/app/ErrorBoundary.tsx` → the routed page. Routes, all client-side: `/` → `features/editor/pages/EditorHome.tsx` (resolves which song to open — the last one opened here, else the newest owned, else any visible, else a new one — and `navigate`s with `replace`), `/songs/:songId` → `features/editor/pages/EditorPage.tsx` → `SongSession` (keyed by id) → `TabSheetEditor.tsx`, `/library` → `features/library/pages/LibraryPage.tsx`, `/settings` → `features/settings/pages/SettingsPage.tsx`; anything unmatched falls back to `EditorHome`. `EditorHome` shares one module-level promise so StrictMode's double effect cannot create two songs. The open library folder is the `?folder=<id>` search param (`useSearchParams`), not component state, so browser back walks out of a folder and a link opens one; an id that names no folder renders the root. `react-router-dom` is the only routing dependency — still no context and no providers. Deep links survive a hard reload because axum's SPA fallback serves `index.html` for unknown paths.

**There is deliberately no `/login` route.** `AuthGate` sits *inside* `BrowserRouter` and *above* `AppLayout`, and while there is no session it renders `features/user/pages/LoginPage.tsx` in place of the entire application — header included. Because the URL is never touched, whatever deep link the visitor arrived on renders the moment they sign in, with no `?next=` to thread through. It renders nothing but a splash until `GET /users/me` answers, so the application is never briefly visible to an anonymous visitor and a returning one never sees the form flash.

**`/settings` is user settings only** — Account (display name, saved to the server through `PUT /users/me/name`; email, read-only; sign out) and Appearance (theme, accent). It is reached solely from the header's user chip; there is no `Settings` nav item, because the chip already went there and two entry points to one page read as two pages. Everything in `AppSettings` (volume, speed, loop, fretboard panel, read-only) is edited in the editor's own command bar instead: the Output popover and the View menu. The settings page does not import `settingsStore` at all.

- **State**: ~20 `useState` hooks inside `TabSheetEditor.tsx` — the whole editor, minus playback and the live channel. No `useReducer`, no store library. `usePlayback` is the only custom hook.
- **Mutation**: every local edit is a named closure calling `editSong(prev => …)` with immutable `map`/spread rebuilds; `editSong` is `setSong` behind the `readOnly` gate (`viewMode || role === 'viewer'`). The one bare `setSong` is the remote-song listener. `updateActiveBeatNotes` is the shared primitive behind fret entry, technique toggles, and note removal. It writes the cursor's beat unless given an explicit `at`: a click that moves the cursor and writes a note in one handler must pass `at`, because the cursor state only changes on the next render. `setFretForActiveNote` refuses on a pitched track, which has no strings.
- **Live sync**: `features/editor/songChannel.ts` owns one `Y.Doc` and one WebSocket per open song and is created once per `SongSession`. The editor publishes every `song` change with `channel.publish(song)`, which diffs it into the doc (`songDoc.ts`); remote changes arrive through `channel.onRemoteSong`, a **subscription**, because `eslint-plugin-react-hooks` 7 errors on synchronous `setState` in an effect body and on reading `ref.current` during render. `lastRemote` stops a received song being published back. Presence, role and connection status come from `useSyncExternalStore(channel.subscribe, channel.getState)`. The cursor follows its bar and beat **by id** after remote changes (`locateCursor` in `songUtils.ts`).
- **`songDoc.ts` is what makes merging work**: the Yjs root map `'song'` holds the `TabSong` fields; objects are `Y.Map`s, arrays `Y.Array`s. Writing diffs instead of replacing: arrays whose items all carry a string `id` (tracks, bars, beats) are synced **by id**, everything else by position, and an unchanged value writes nothing — so an unchanged song emits no update at all (tested; it is the echo-loop guard). Replace a subtree wholesale and concurrent edits inside it are lost.
- **Persistence**: the server holds songs and folders. `localStorage` keeps only per-browser preferences, each store validating at the boundary. `session.ts` is deliberately in-memory, and `authApi.ts` plus `features/library/libraryApi.ts` are the network.
  - `features/library/libraryStore.ts` is **types plus pure tree queries**, no storage: `Library { folders; entries }` as the server reported it to this user, `Role`/`canEdit`, and the derived tree — `folderPath`, `childFolders` (name-sorted), `songsIn` (server order: most recently updated first), `countSongsIn` (whole subtree), `folderChoices(library, ownerId, excludeSubtreeId)` (depth-first; only folders of that owner the user may edit, which are the only legal move targets). **Folders stay flat**: `parentId`, with `null` at the root *and* on the top folder of a share, whose real parent the collaborator cannot see — that is how "Shared with me" is found. It also keeps the last-opened song id under `'sheetor-last-song'`.
  - `features/library/libraryApi.ts` wraps every library, folder, share and song endpoint on top of `app/http.ts` (`request`, `sendJson`, `failWith`, `readMessage`). Readers validate each snake_case field and map to camelCase; lists drop unreadable items, single replies throw. `createSong` uploads `encodeSong(song)` as `application/octet-stream`.
  - `features/settings/settingsStore.ts` owns key `'sheetor-settings'` (`AppSettings`: `masterVolume`, `playbackSpeed`, `loopPlayback`, `showToolPanel`, `readOnly`, `defaultBpm`, `midiInput`). Validation is **field by field** — one bad value can never discard the rest.
  - `features/user/userStore.ts` owns key `'sheetor-user'` (`User`: `id`, `name`, `email`, `theme`, `accent`) — the profile as this browser displays it. Field-by-field validation, plus a module-level cache so `getUserSnapshot` can feed `useSyncExternalStore` a stable reference, and a `subscribeUser` listener set so the header chip and the settings page never disagree. Signing in mirrors the account into it (`id`, `name`, `email`); `theme` and `accent` are local-only and are never touched by the server.
  - `features/user/session.ts` is the one store that is **not** persisted, on purpose: it holds `'checking' | 'in' | 'out'` and nothing about it may survive a reload, because a stored "signed in" flag becomes a lie the moment the cookie expires. Same listener-set shape as `userStore`, so `AuthGate` and the settings page read it with `useSyncExternalStore`.
  - `features/user/authApi.ts` holds the account calls: `login`, `register`, `logout`, `fetchSession`, `renameAccount` each leave both stores correct, so no caller has to remember to flip the session itself; `fetchAuthConfig` never throws and falls back to "email form, no SSO". The session is the `HttpOnly` cookie the response sets — no script reads or stores a token. `register` posts `/users/create` and then `/users/login`, because creating an account issues no cookie. SSO is a plain link to `SSO_LOGIN_URL`; failures come back as `?sso_error=<code>`.
  - The editor reads the settings once at mount and writes the six shared playback/panel/input values back through `updateSettings` when they change, so the settings page and the transport never disagree. `tuning` is per-track song data; `synthType` and the remaining UI flags reset on reload.
- **Playback**: owned entirely by `usePlayback.ts` (raw Web Audio API). `requestAnimationFrame` lookahead scheduler (100 ms) advancing `nextBeatTimeRef`; cursor position advances through `nextPlayPosition` (repeat signs, then `nextBeatPosition`), which always terminates. Every setting (`song`, `tuning`, `volume`, `synthType`, `loop`, `speed`) is read through `settingsRef`, refreshed by a dependency-less effect after each render, so mid-playback changes take effect on the next scheduled beat. `synthType === 'guitar'` uses the Karplus-Strong buffer from `audioEngine.ts`, otherwise an `OscillatorNode` + ADSR gain. Once every beat is scheduled, `stop` runs when the last one has **ended**, not when it was scheduled: stopping early cleared the pending cursor timers, so the last beat never showed.
- **Rendering**: notation is one inline `<svg className="music-svg">` with a computed `viewBox` and hand-written `<path>` glyphs (clef, flags, beams); the virtual fretboard is DOM `<div>`s with computed inline styles. No canvas, no VexFlow/alphaTab.
- **Geometry**: `layout.ts` is pure, React-free, and owns all constants (`MAX_ROW_WIDTH 980`, `TAB_STAFF_TOP 90`, `FRET_COUNT 15`, …) plus `computeMeasureLayouts` two-pass line breaking/stretching and `alignBars`, which spaces the bars drawn one above another (a grand staff's two hands) on their shared onsets, so notes struck together line up whatever each hand's rhythm.
- **Theming**: `<html>` carries two independent attributes — `data-theme="light|dark"` (lightness ladder + ink polarity) and `data-accent="amber|teal|indigo|violet|rose"` (neutral tint + accent triplet). `features/user/theme.ts` is the only module that touches `documentElement`; `main.tsx` calls `applyTheme(loadUser())` once, then re-applies on every `subscribeUser` notification and every `prefers-color-scheme` change, so no component ever writes the attributes. An inline script in `index.html` sets them during head parse to kill the first-paint flash — keep its `'sheetor-user'` key and field names in sync with the store.

## Key Directories

| Path | Purpose |
|---|---|
| `apps/backend/src/api/` | `mod.rs` (`/api/v1` nesting, `ApiDoc` tags, `not_found`), `current_user.rs` (the `CurrentUser` extractor), plus one directory per feature (`system/`, `users/`, `auth/`, `library/`, `folders/`, `songs/`), each a `mod.rs` router and one file per endpoint |
| `apps/backend/src/` | `lib.rs` (module list), `main.rs` (process entry only), `app.rs` (router assembly), `config.rs`, `state.rs` (`AppState`, `AuthSettings`, `Sso`), `frontend.rs` |
| `apps/backend/src/collab/` | Live editing: rooms, hub, WebSocket session, delayed saves, access revalidation, song summary |
| `apps/backend/src/services/` | Business logic: `user_service.rs` (signup, rename), `auth_service.rs` (the `axum-login` `Backend`, `Credentials`, the `AuthSession` alias), `sso_service.rs` (OIDC flow and account resolution), `access_service.rs` (every permission check), `library_service.rs`, `folder_service.rs`, `song_service.rs`, `share_service.rs` |
| `apps/backend/src/error/` | One module per feature; the enum's `#[derive(ApiError)]` *is* the HTTP mapping |
| `apps/backend/src/helpers/` | Leaf pure functions — `users/password.rs` (argon2 hash/verify plus the complexity rule) |
| `apps/backend/src/database/` | `mod.rs` (`init_pool`: connect + run migrations), `schemas/<table>.rs` (row types only), `queries/<table>.rs` (the SQL, and the only place constraint names appear) |
| `apps/backend/migrations/` | sqlx migrations, applied at boot by `init_pool` and compiled in by `sqlx::migrate!`. Append-only: edit one that has run and the checksum no longer matches. The session table is **not** here — `PostgresStore::migrate()` owns `tower_sessions.session` |
| `apps/backend/tests/` | Integration tests, gated on `TEST_DATABASE_URL` |
| `apps/frontend/src/app/` | `AuthGate`, `ErrorBoundary`, `http.ts` (the shared `fetch` helpers), `layout/` (`AppLayout` + `AppHeader`: logo, the two `NavLink`s, and the user chip that opens `/settings`) |
| `apps/frontend/src/features/editor/components/` | The editor **and** its pure modules (`types.ts`, `layout.ts`, `songUtils.ts`, `songSchema.ts`, `audioEngine.ts`, `usePlayback.ts`) |
| `apps/frontend/src/features/editor/` | `songDoc.ts` (song ↔ Yjs), `songChannel.ts` (the live socket), `pages/EditorHome.tsx`, `pages/EditorPage.tsx` (`SongSession`) |
| `apps/frontend/src/features/library/` | `libraryStore.ts` (types + tree queries), `libraryApi.ts` (the library endpoints), `components/ShareDialog.tsx`, `LibraryPage.css`, `pages/LibraryPage.tsx` |
| `apps/frontend/src/features/settings/` | `settingsStore.ts` (editor/playback prefs, written by the editor), `SettingsPage.css`, `pages/SettingsPage.tsx` (user settings only — it does not read the store beside it) |
| `apps/frontend/src/features/user/` | `userStore.ts` (profile), `session.ts` (transient status), `authApi.ts` (account and sign-in calls), `theme.ts` (the only DOM-writing theme code), `LoginPage.css`, `pages/LoginPage.tsx` |
| `apps/frontend/test/` | Every test, in a **shadow tree mirroring `src/`**: `test/features/user/userStore.test.ts` covers `src/features/user/userStore.ts` |

Note the shape gotcha: the editor's older non-component modules sit under `components/`, not at `features/editor/`. Newer modules do **not** copy that — `songDoc.ts`, `songChannel.ts` and the library store and API sit at the feature root, with pages under `pages/` and extra components under `components/`. Prefer the newer shape. `app/http.ts` is the one shared helper; there is no `shared/`, `lib/`, or `utils/` directory.

Tests are **not** colocated. `test/` mirrors `src/` path for path, so a test imports its subject with a `../`-prefixed hop back through `src/` (`../../../src/features/user/userStore`). Add a module and its test lands at the same relative path under `test/`. There are no tsconfig path aliases — if the `../../../` prefixes ever become the problem, add a `resolve.alias` to `vitest.config.ts` **and** a matching `paths` to `tsconfig.app.json`, or the two resolvers will disagree.

## Development Commands

```bash
npm install                 # root only — the npm workspace is apps/frontend
npm run dev                 # cargo watch + vite; use http://localhost:5173
npm run dev:backend         # cargo watch -q -c -w apps/backend -x run  (:4000)
npm run dev:frontend        # vite (:5173, strictPort), proxies /api + /docs to :4000
npm run build               # frontend dist, then cargo build --release
npm run check               # test + typecheck + lint, in that order — the gate
npm run lint                # eslint (frontend) + cargo clippy -D warnings
npm run typecheck           # tsc -b (frontend) + cargo check --all-targets
npm test                    # vitest run (pure modules) + cargo test
npm run start:backend       # cargo run --release — one port, :4000
```

Every command needs the dev shell for `cargo`/`cargo-watch`. `.envrc` is `use flake`, so with direnv allowed they work in a plain shell; without it, prefix with `nix develop --command`.

Verification gates, exactly:

```bash
npm run check                                   # vitest + tsc -b + cargo check + eslint + clippy
TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test   # the database tests
npm run build && npm run start:backend          # axum serves dist on :4000
curl -s localhost:4000/api/v1/system/health     # smoke
docker build -t sheetor .                       # the release image (needs a current .sqlx/)
```

## Code Conventions & Common Patterns

### Backend (Rust)

- Edition 2024, one crate (`sheetor-backend`) in a root Cargo workspace; `cargo fmt` and `cargo clippy --all-targets -- -D warnings` are clean and are the gate. No `unsafe`. Functions stay short (split helpers rather than nesting); comment only what the code cannot say itself (the `SameSite` reason, the `small-client` reason, the `// ponytail:` ceilings).
- Adding an endpoint: one file per endpoint under its feature directory, holding the request type and the handler with its `#[utoipa::path]`:

  ```rust
  // src/api/songs/show.rs
  #[utoipa::path(get, path = "/{id}", tag = "songs", summary = "…",
      params(("id" = Uuid, Path, description = "Song id")),
      responses((status = 200, body = Song), (status = 404, description = "No such song")))]
  pub async fn handler(
      State(state): State<AppState>,
      CurrentUser(user): CurrentUser,
      Path(id): Path<Uuid>,
  ) -> Result<Json<Song>, LibraryError> {
      Ok(Json(song_service::get(&state.db, user.id, id).await?))
  }
  ```

  Then `mod show;` and `.routes(routes!(show::handler))` in the feature's `mod.rs` (two methods on one path go in one `routes!(a, b)`), and for a new feature `.nest("/songs", songs::router())` plus a tag in `ApiDoc` in `src/api/mod.rs`. `path` is prefix-relative — never hardcode `/api/v1` in a handler; `api::router`'s `nest` applies it once, to both the routes and the spec. A handler extracts, calls **one** service, and shapes the response.
- Handlers return `Json<T>`/`impl IntoResponse`; the `#[utoipa::path]` attribute sits on the handler so `routes!` can collect method, path, and schema together. utoipa validates nothing at runtime — the return type is the contract.
- Shared runtime values live in `AppState` (`src/state.rs`) and are reached with the `State` extractor. It is `Clone`, **not** `Copy`, because it holds a `PgPool`; the pool is an `Arc` internally, so cloning per request is a refcount bump and wrapping the state in another `Arc` would be redundant.
- Database access uses the **`query_as!`/`query_scalar!` macros**, so `cargo check`, `clippy` and rust-analyzer all need a reachable `DATABASE_URL` at compile time — the dev shell exports one and autostarts the cluster it points at. The macro builds the struct by field name and does **not** use `FromRow`, so the `SELECT`/`RETURNING` column list must match the struct's fields exactly; nullability is inferred from the schema, overridable with `col as "col!"`, `col as "col?"` or `col as "col: T"` (roles are read as `role AS "role!: Role"`, a `sqlx::Type` over `text`). The committed `.sqlx/` is what the Docker build compiles against (`SQLX_OFFLINE=true`): after **every** query edit run `cargo sqlx prepare --workspace -- --all-targets` and commit the result, or the image build fails on stale data.
- sqlx is pinned to **0.8, not 0.9**, because every release of `tower-sessions-sqlx-store` depends on `sqlx ^0.8.0`. Bump it and cargo compiles sqlx twice: `PgPool` from 0.9 is a different type from `PgPool` from 0.8, so the session store cannot take `state.db` and you run a second pool for nothing.
- **Never check-then-insert.** Asking "is this email free?" before an insert is a time-of-check/time-of-use race: two concurrent requests both see a free name and both proceed. Let the `UNIQUE` constraint arbitrate, then classify the failure — `error.as_database_error()`, `db.is_unique_violation()`, and `db.constraint()` to learn which one collided. Prefer `is_unique_violation()` to comparing SQLSTATE strings, and note that `sqlx::Error` is `#[non_exhaustive]`, so a `match` needs a `_` arm.
- Constraint names are the contract between the migration and the error mapping: `UNIQUE` on `users.email` yields `users_email_key` (`{table}_{column}_key`), and `users_provider_identity_key` is `UNIQUE (provider, provider_id)`, which `insert_sso_user`'s `ON CONFLICT` relies on. Rename a column, or name a constraint explicitly, and the match arms in `database/queries/users.rs` must follow or a duplicate becomes a 500. The reverse holds too — an error variant with no constraint behind it can never fire, so the enum and the migration change together. `username` is deliberately **not** unique; `tests/users.rs` pins that.
- Four layers, one direction: `database/schemas/` holds row types only (`User`), `database/queries/` holds the SQL and is the only place that knows about SQLSTATE or constraint names, `services/` holds the business logic — hashing a password, verifying one, orchestrating several queries — and `error/` holds the domain error each service returns. A handler calls a service, never a query. argon2 is ~50 ms of CPU, so both hashing (`user_service::create`) and verification (`auth_service::authenticate`) run inside `spawn_blocking`; calling them directly would stall the runtime under a burst of logins.
- Config: extend `Config` in `src/config.rs` instead of reading `std::env` inline. It is built once, in `main`, and passed by reference.
- Errors are enums in `src/error/`, one module per feature, and the HTTP mapping *is* the derive: `#[derive(ApiError)]` from `api-error`, with `#[api_error(status_code = 409, message(inherit))]` per variant. Omit the attribute and the variant is a 500 whose message is the status reason phrase — the right default for anything a client should not see. Note that `api_error::ApiError` is a **trait**: there is no `ApiError::BadRequest` to construct and `impl From<MyError> for ApiError` does not compile. The crate's `axum` feature is enabled, so an error type is returnable straight out of a handler. `api::not_found` is the one hand-rolled response. Still no CORS layer and no graceful shutdown.
- Auth is `axum-login` over `tower-sessions` with the Postgres store. `auth_service` implements `AuthUser for User` (id = `i32`, `session_auth_hash` = the stored argon2 hash, so changing a password invalidates every issued session) and `AuthnBackend for Backend`. Login returns the same 401 for an unknown address and a wrong password; a row with `password_hash IS NULL` is a provider-only account and no password authenticates it, including an empty one. `LOCAL_AUTH_ENABLED=false` makes `/users/create` and `/users/login` answer 403 before doing anything else.
- SSO (`sso_service.rs`, `api/auth/`) is Authorization Code + PKCE with `openidconnect`; discovery runs **per login**, so the app boots while the provider is down. The CSRF state, nonce and PKCE verifier sit in the session under `sso.pending` between `/auth/sso/login` and `/auth/sso/callback`. The callback always redirects: `/` on success, `/?sso_error=<code>` otherwise (`SsoError::code`). `resolve_user` returns the account already holding the identity, else links the account with that email **only if the provider says it is verified**, else creates one — an unverified collision is `EmailTaken`, never a silent merge. The OIDC HTTP client follows no redirects (SSRF guidance from the crate).

### Frontend

- ESM (`"type": "module"`); named exports are the norm (`App` and `TabSheetEditor` are the only default exports).
- `import type { … }` for every type-only import (`verbatimModuleSyntax` is on).
- Arrow-function consts with explicit return annotations for module-level functions.
- No path aliases in any tsconfig — **relative imports only**. TypeScript is pinned `~5.9.3`.
- Function components only; arrow + named export (`export const AppHeader = () => …`). `React.FC` appears once (`TabSheetEditor`, with `TabSheetEditorProps`); elsewhere props are typed inline in the parameter (`({ folder, onClose }: { folder: LibraryFolder; onClose: () => void })`).
- Naming: components PascalCase (`TabSheetEditor.tsx`, matching `TabSheetEditor.css`), non-component modules camelCase (`songUtils.ts`), directories lowercase.
- CSS: plain global stylesheets imported for side effect; kebab-case classes namespaced `sheetor-*`; inline `style={{}}` only for computed geometry. No CSS modules, no Tailwind.
- **Design tokens live in `src/index.css` and are the only place a colour, radius, spacing step, control height or shadow is defined.** Reference them (`var(--surface-2)`, `var(--sp-3)`, `var(--ctl-h)`) — a new hex or a magic `12px` in a component stylesheet is a defect.
- The colour tokens have two axes, both keyed off attributes on `<html>`: `:root` plus `[data-theme='light']` give the lightness ladder and flip `--ink-rgb`; five `[data-accent='…']` blocks re-point `--tint-h`/`--tint-s` (which the neutrals are `hsl()`-derived from) and the `--accent-rgb`/`--accent-hover-rgb`/`--accent-ink` triplet, with a light-mode override per palette. A custom property's `var()`s are substituted **where it is declared**, so re-pointing `--tint-h` only re-tints the neutrals because the palette block and `:root` both match `<html>`; conversely an element deeper in the tree that sets `--accent-rgb` (the settings swatches do) changes only what reads `rgb(var(--accent-rgb))` directly, never the inherited `--accent`.
- `--instr-*` is the deliberate exception to theming: the fretboard neck, nut, strings and piano key faces are depictions of physical objects and stay dark/physical in both themes. Only their accent and playback-state stops follow the palette. Never point an `--instr-*` token at `--ink-rgb` or `--text-*` — a theme-following value there vanishes into the wood.
- One control rhythm: every button, field and menu trigger is `var(--ctl-h)` tall with `var(--r-md)` corners. `.btn` and `.bottom-menu-trigger` are deliberately identical so the command bar has one silhouette; `.btn-primary` (accent fill) marks the single main action, `.btn-active` (accent tint) marks a toggle that is on.
- SVG **presentation attributes cannot resolve `var()`**, so notation glyphs carry a class and the paint is a CSS property: `.glyph-ink`/`.glyph-ink-stroke` (`--ink`), `.glyph-label`/`.slur-line` (`--ink-dim`), `.tab-stem`/`.tab-beam` (`--ink-faint`), `.selection-ring`, `.cursor-ring`, `.playback-line`, `.measure-wash`, `.technique-pm`, `.technique-ring`, and `.notehead` with `.is-hollow`/`.is-selected`. A literal `fill="#…"` inside the score SVG is a defect — it will not flip with the theme. `--paper` must equal `.tab-fret-bg`'s fill or the fret-number knockouts show as boxes.
- Icons are hand-inlined 24×24 `<svg>` with `stroke="currentColor"` — no icon package.
- Pure logic belongs **outside** the component: geometry/constants → `layout.ts`, music theory/model → `songUtils.ts`. `audioEngine.ts` receives an `AudioContext`, never owns one.
- Strict typing with **no `any` anywhere** — the former `(window as any).webkitAudioContext` and `catch (err: any)` are gone. Unvalidated input is `unknown` and passes through `parseSong`; the prefixed `AudioContext` is reached by `in` narrowing plus one named cast in `usePlayback.ts`. Do not reintroduce `any`.

### Domain invariants (`features/editor/components/types.ts`)

- `TabNote.stringIndex` is **0 = highest string**, matching `tuning[]` high→low. Every Y coordinate depends on this.
- A track's **kind is derived from its instrument**, never stored: `trackKind(instrument)` in `songUtils.ts` maps guitar/bass → `'fretted'` and everything else → `'pitched'`, and `isFretted(track)` is the read. `TabTrack` has no `kind` field and `parseSong` ignores one in a file. This used to be a stored field the UI never wrote, so a new track was permanently pitched with no way to get a TAB staff.
- `display` is `StaffDisplay`, and which values a track may hold depends on its kind: `STAFF_DISPLAYS` in `songUtils.ts` (`fretted`: both/notation/tab; `pitched`: notation), used by `parseSong` and the View menu alike. An old one-track `'grand'` reads as `'notation'`.
- A **grand staff is two pitched tracks**, one per hand, so each hand keeps its own rhythm: the upper track's `bassTrack` names the track drawn on the bass staff. `grandStaffOf(tracks, index)` is the only read and checks the link each time — a missing, fretted, chained or doubly claimed partner just means no grand staff, so deleting or retuning a track needs no repair and `parseSong` only type-checks the id. The View menu's Grand staff runs `addBassStaff`, which moves every note below middle C (`GRAND_SPLIT`) to a new track right after, same rhythm, fresh ids; Notes only removes the link, keeping both tracks.
- The editor still edits one track: with a grand staff, `staves` holds both hands (`Staff` = row offset + track index + its clef at every bar) and the active one gets the cursor, input and selection. Staff clicks and noteheads carry their staff's track, and a click on the other hand switches `activeTrackIndex` and writes there (`updateActiveBeatNotes(fn, at, trackIndex)`), so the keyboard and MIDI always write to the hand you are on. Beat x comes from `getBeatCoordinates(mIdx, bIdx, staff)`, which reads `alignBars`; pass the staff whenever the beat is not the active track's.
- Clefs are per track and per bar, like tempo: `TabTrack.clef` is the one bar 1 opens in, `TabMeasure.clef` (the track's own bars, not the conductor's) a change that holds until the next, and `getEffectiveClefs(track, opening)` resolves every bar at once, `opening` being treble, or bass for a grand staff's lower staff, when the track sets none. So either hand can be treble or bass anywhere. Every pitch-to-position read goes through `staffStep(midi, staff, mIdx)` (and a staff click through `clefAt(staff, mIdx)`), so a new one must pass the bar. The Song menu's Measure section sets it through `setClef` (bar 1 writes the track, and picking the clef the bar before already has removes the change). A change inside a row is drawn smaller before the bar's first beat, with `CLEF_CHANGE_ROOM` added by `computeMeasureLayouts`' `clefChanges`; one that lands on a row start is just that row's clef. `addBassStaff` strips the right hand's clefs from the new left hand.
- To the user a grand staff is **one part**, not two tracks: `TrackStrip` gives the left hand's track no chip, and in the editor `handsOf(index)`/`updatePart` apply mute, solo, volume and the instrument (through `retuneTrack` per hand) to both, while `duplicateActiveTrack` copies the pair linked and `deleteActiveTrack` removes both. The name lives on the treble track (`part`). Any new track-level control must go through `updatePart`, or the hands drift apart. The keyboard panel's Left/Right hand switch (left hand on the left, as on the keys) (`switchHand`) moves to the other hand's beat sounding at the same moment (`beatOnset`/`beatAt` in `songUtils.ts`), and the keys use only the accent: the hand being written is lit solid (`.active`), the other hand in a pale tint (`.other-hand`), its notes from that same lookup or from `playback.otherHandBeat` while playing.
- Changing a track's instrument must go through `retuneTrack(track, instrument)`, which returns the whole patch — `instrument`, `transpose`, a default `name` that follows the instrument, `display` when the kind flips, and for any fretted side the new instrument's `defaultTuning` with every note rewritten through its **sounding** MIDI (`resolveNoteMidi` out, `placeMidiOnStrings` back in, technique flags copied via `TECHNIQUE_KEYS`). Guitar ↔ bass counts: a bass brings its four strings. Patch only `instrument` and you strand notes in the other shape, which renders as `NaN`.
- Tunings live in `songUtils.ts`: `tuningPresets(instrument)` (guitar or bass; `Standard` is what `defaultTuning` returns and what `createTrack` and `parseSong`'s fallback use) and `resizeTuning`, which adds each extra string a fourth below the lowest — right for a 7-string guitar and a 5-string bass alike. `MAX_STRINGS` is 12.
- `duration` is a string union `'1'|'2'|'4'|'8'|'16'|'32'` — convert with `getDurationVal` (quarter = 1.0, dot = ×1.5), never arithmetic on the literal. The union is re-spelled inline in ~12 signatures instead of a named alias; changing durations touches all of them.
- `TabMeasure.bpm`/`timeSignature` are optional overrides resolved by backward scan (`getEffectiveBpm`, `getEffectiveTimeSignature`) falling back to the `TabSong` values.
- A track's key is `keySignature` (sharps positive, flats negative, ±`MAX_KEY_ACCIDENTALS`; absent is C major), set in Track settings through `updatePart`, so a grand staff's hands share it. Every written pitch goes through `spellPitch(midi, transpose, key)`: a pitch the key has takes the key's letter (B♭ in F major sits on the B line), any other is its white key or a black key spelled toward the key's side. `barAccidentals` then decides what is actually printed: nothing where the key or an earlier note on the same line or space in the bar already says it, else ♯/♭/♮. Staff clicks go back through `staffStepToSoundingMidi(step, transpose, key)`, so the F line is F♯ in G major. The signature is drawn after the clef on every row (`keySignatureSteps`, a line lower on the bass clef via `Clef.keyOffset`), and `computeMeasureLayouts`' `keyRoom` widens the row start to fit it.
- Repeat marks are conductor data too: `repeatStart` (‖:) and `repeatEnd` (:‖, the total number of plays, `MIN_REPEAT`–`MAX_REPEAT`) live on track 0's bars only, and the score, `computeMeasureLayouts(widths, conductor)` and playback all read them from there. Playback follows them through `nextPlayPosition`, whose per-track `passes` map counts how often each :‖ was reached; a :‖ with no ‖: goes back to the bar after the previous :‖, or to bar 1.
- Copy/paste is `copyBeats`/`pasteClip`/`removeBeats` in `songUtils.ts`. A selection that runs from a bar's first beat to a bar's last is **whole bars** and pastes as new bars on every track; anything else pastes as beats after the cursor. Pasting re-voices notes by sounding pitch unless the target string has the same open pitch. The clipboard lives in `features/editor/clipboard.ts`, per tab, so it survives opening another song; the selection anchor is stored by bar/beat id.
- MIDI input is `features/editor/midiInput.ts`. `readMidiKey` turns raw messages into presses plus a release once the last key is up; a key pressed while another is held joins it as a chord, as in MuseScore. `useMidiInput` listens to every input, including ones plugged in later, while the Edit menu's toggle is on and the song is editable. In the editor the first key of a chord replaces the cursor beat's notes, and the release advances like →. That advance runs inside `flushSync`: without it, a key pressed before the next render is written onto the beat just played. Web MIDI needs a secure context, so it works on `localhost` and HTTPS only.
- Tempo writes go through `setMeasureBpm(index, bpm)`, which takes the bar **explicitly** — the score's `♩=` marks edit whatever bar was clicked, which is rarely the bar under the cursor. It clamps to `MIN_BPM`/`MAX_BPM` and rounds, so callers never pre-validate. Bar 1 writes `song.bpm` and deletes its own override; every later bar writes the override. `setConductorMeasure(index, patch)` is the same rule for metre.
- The editor's tempo bounds are `MIN_BPM`/`MAX_BPM` in `songUtils.ts`, shared with `parseSong` so anything typeable reloads. `settingsStore.ts` keeps its own narrower 30–300 — that one bounds the *default* tempo for new songs, not what a song may hold; do not merge them.
- IDs are the inline expression `Math.random().toString(36).substring(2, 9)`, duplicated in 15+ places across `TabSheetEditor.tsx` and `songUtils.ts`; no helper exists.

## Important Files

| File | Role |
|---|---|
| `apps/backend/src/main.rs` / `app.rs` | Process entry / `build(&Config)` and its registration order |
| `apps/backend/src/config.rs` | `Config::from_env` — the whole runtime config surface |
| `apps/backend/src/frontend.rs` | `ServeDir` + SPA fallback, mounted only when `dist` exists |
| `apps/backend/src/api/mod.rs` | Sole `/api/v1` prefix site, `ApiDoc` tags, JSON `not_found` |
| `apps/backend/src/api/system/health.rs` | Canonical route template |
| `apps/backend/src/api/users/login.rs` | Canonical session route: `AuthSession` extractor, `authenticate` then `login` |
| `apps/backend/src/services/auth_service.rs` | `AuthUser for User` and `AuthnBackend for Backend` — the whole auth contract |
| `apps/backend/src/error/auth.rs`, `error/users.rs` | The status codes; `#[api_error(status_code = …)]` is the mapping |
| `Cargo.toml` (root) | Cargo workspace, `members = ["apps/backend"]`, shared `target/` |
| `apps/backend/src/services/access_service.rs` | Every permission check: 404 for invisible, 403 for too weak, and whose library an item lands in |
| `apps/backend/src/collab/hub.rs`, `session.rs` | The live rooms and one socket's lifecycle |
| `apps/backend/src/services/sso_service.rs` | The OIDC flow and how an identity maps to an account |
| `apps/backend/migrations/*_create_library.sql` | `folders`, `songs`, `folder_shares`, and the `folder_role` SQL function |
| `apps/frontend/src/App.tsx` | `BrowserRouter` and the routes |
| `apps/frontend/src/features/editor/songChannel.ts` | The live socket: sync, presence, reconnects, close codes |
| `apps/frontend/src/features/editor/songDoc.ts` | `TabSong` ↔ Yjs, and the id-keyed diff that makes merges work |
| `apps/frontend/src/features/library/libraryApi.ts` | Every library, folder, share and song call |
| `apps/frontend/src/features/settings/settingsStore.ts` | `AppSettings` with field-by-field validation; the editor is now its only writer |
| `apps/frontend/src/app/AuthGate.tsx` | The gate: splash, sign-in screen, or the app |
| `apps/frontend/src/features/user/authApi.ts` | `login`/`register`/`logout`/`fetchSession`/`renameAccount`/`fetchAuthConfig` |
| `apps/frontend/src/features/user/session.ts` | `'checking' \| 'in' \| 'out'`, deliberately not persisted |
| `apps/frontend/src/features/user/userStore.ts` | The local profile: `User`, the palette/theme enums, the subscription the header and settings page share |
| `apps/frontend/src/features/user/theme.ts` | `resolveTheme`/`applyTheme`/`watchSystemTheme` — the only code that writes `data-theme`/`data-accent` |
| `apps/frontend/src/features/editor/components/TabSheetEditor.tsx` | The application (state, keyboard, SVG render) |
| `apps/frontend/src/features/editor/components/usePlayback.ts` | All playback: scheduler, voices, transport state |
| `apps/frontend/src/features/editor/components/songSchema.ts` | `parseSong` — the only validation boundary for stored/imported songs |
| `apps/frontend/src/features/editor/components/layout.ts` | Pure layout geometry |
| `apps/frontend/src/features/editor/components/songUtils.ts` | Music theory, beaming, MIDI ↔ note names, `createId`/`createEmptySong`, beat-position walking |
| `apps/frontend/vite.config.ts` | `port: 5173, strictPort: true` + the dev proxy of `/api` (with `ws: true`) and `/docs` to `:4000` |
| `Dockerfile` | Node build of `dist`, `SQLX_OFFLINE` release build, slim runtime with both |
| `apps/frontend/vitest.config.ts` | `include: ['test/**/*.test.ts']`, `environment: 'node'` |
| `apps/frontend/eslint.config.js` | ESLint 9 flat config (frontend only) |

### Environment variables (all backend)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | Parsed as `u16`; unparsable or `0` falls back |
| `DATABASE_URL` | exported by the dev shell | Required at **runtime** (`init_pool` panics without it) *and* at **compile time** for the `query_as!` macros, unless `SQLX_OFFLINE=true`. `flake.nix` sets it; read with `std::env` inside `init_pool`, not through `Config` |
| `PUBLIC_URL` | `http://localhost:<PORT>`; the flake sets `http://localhost:5173` | The origin the browser uses. The live socket refuses any other `Origin`, and the SSO redirect URI is `PUBLIC_URL/api/v1/auth/sso/callback`. Trailing `/` is trimmed |
| `OIDC_ISSUER_URL` | unset | Setting it enables SSO; `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are then required (boot panics without them) |
| `OIDC_DISPLAY_NAME` | `Single sign-on` | The button reads "Continue with …" |
| `LOCAL_AUTH_ENABLED` | `true` | `false` turns off email-and-password sign-in and sign-up; ignored when SSO is not configured |
| `HOST` | `0.0.0.0` | |
| `LOG_LEVEL` | `info` | Used as the `EnvFilter` directive; `RUST_LOG` overrides it entirely |
| `FRONTEND_DIST_DIR` | `<crate>/../frontend/dist` | Compile-time default from `CARGO_MANIFEST_DIR`; set it when the binary is deployed elsewhere |
| `TEST_DATABASE_URL` | none | Tests only. Unset, every test in `apps/backend/tests/` logs `skipped` and passes, which keeps `npm run check` green without a database |
| `COOKIE_SECURE` | `true` | Anything but the literal `false` keeps `Secure` on the session cookie. Set `false` only to drive the API over plain http with curl, which refuses to send a `Secure` cookie — a browser sends one to `localhost` regardless |

`DATABASE_URL` has two sources and the later one wins: `flake.nix`'s `env` sets a default that both direnv and a bare `nix develop --command` see, then `.envrc`'s `dotenv_if_exists .env` overrides it under direnv only. `.env` is gitignored (as `.env` and `.env.*`, spelled out so the pattern does not swallow the tracked `.envrc`) — keep credentials there, never in the flake.

## Runtime/Tooling Preferences

- **npm is the package manager** (single root `package-lock.json`, `lockfileVersion: 3`). No Bun, pnpm, or yarn anywhere; no `packageManager` or `engines` field. Install from the repo root, never inside a workspace.
- Node ≥ 20 in practice (`@types/node` ^24, NodeNext ESM); unpinned.
- `vite` is aliased to **`npm:rolldown-vite@7.2.5`**, not upstream Vite. Plugin/version advice must account for the Rolldown build.
- Frontend runtime dependencies are exactly `react`, `react-dom`, `react-router-dom` and `yjs` (13.x). There is no UI kit, icon package, date library or state library — icons are hand-inlined SVG and relative timestamps are a local helper in `LibraryPage.tsx`.
- Backend dev is `cargo watch -x run`: a debug rebuild per save, no separate dev runtime. Prod is `cargo build --release` → `target/release/sheetor-backend`, or the root `Dockerfile`, which builds both apps and serves them from one port.
- The Rust toolchain comes from `flake.nix` (nixpkgs stable: `rustc`, `cargo`, `clippy`, `rustfmt`, `rust-analyzer`, `cargo-watch`, `sqlx-cli`, `postgresql`) — no `rustup`, no `rust-toolchain.toml`. Edition 2024, workspace `resolver = "3"`, one `Cargo.lock` and one `target/` at the repo root. Install CLI tooling by adding it to the flake, never with `cargo install` — that writes outside the store and drifts per machine.
- The dev shell **is** the database: its `shellHook` runs `initdb` into the gitignored `.direnv/pgdata` on first entry, starts the cluster on `:5432` if it is not already up, and creates `sheetor` and `sheetor_test`. It is left running when you leave the shell; `pg_ctl stop` ends it. Development uses no docker, no systemd unit and no services-flake; the `Dockerfile` is for release images only.
- `utoipa-swagger-ui` is built with the `vendored` feature, so the build never downloads the Swagger UI bundle (also makes it sandbox-safe).
- Frontend tsconfig is solution-style (`tsconfig.json` → `tsconfig.app.json` for `src`, `tsconfig.node.json` for `vite.config.ts`), driven by `tsc -b`, with `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- `cargo fmt` is the repo's only formatter; TS/CSS have none (no Prettier, no `.editorconfig`) — match surrounding style by hand. **No CI, no git hooks.**
- ESLint covers the frontend only; the backend's gates are `cargo check` and `cargo clippy -- -D warnings`.

## Git & Commits

- **Commit incrementally.** Land one commit per coherent step, as soon as that step's verification passes — do not batch an entire task into a single commit at the end. A step that touches code plus its test/doc updates is one commit.
- **Never `git push`.** Pushing happens only on an explicit request from the user. Same for anything that rewrites shared history (`rebase`, `push --force`, `commit --amend` on an already-pushed commit).
- **Message style is plain and free-form**, matching the existing history (`initial commit`, `made monorepo`) — no Conventional Commits prefixes. Short imperative subject ≤72 chars; add a body only when the *why* is not obvious from the diff.
- **Stage deliberately** (`git add <path>`), never `git add -A`. The working tree may hold unrelated in-progress edits; keep them out of your commit and say so if they are inseparable.
- Do not create branches or tags unless asked; commit onto the current branch.

## Testing & QA

Vitest 3 is installed in the **frontend workspace only** (`vitest run`, config at `apps/frontend/vitest.config.ts`). Tests live in `apps/frontend/test/`, a shadow tree mirroring `src/`, and cover the pure modules — `songUtils`, `songSchema`, `songDoc`, `audioEngine`, `libraryStore`, `libraryApi`, `settingsStore`, `userStore`, `theme`, `authApi`, `midiInput`, `songChannel`, `layout` (195 tests). The API modules are testable without a DOM because the logic is in the module, not the component: `fetch` is stubbed with `vi.stubGlobal` over a real `Response`, exactly as `localStorage` is stubbed elsewhere. `tsconfig.app.json` includes both `src` and `test`, so `tsc -b` type-checks the tests too. There is no jsdom, no component/DOM testing library, and no coverage gate: anything needing a browser is verified by hand.

The backend's tests live in `apps/backend/tests/` (`users`, `auth`, `library`, `sso`, and `collab`, which drives the `Hub` with channels standing in for sockets and needs no database) and talk to a **real Postgres** — there is no mock layer, because what is being tested is what the database does under concurrency. The dev shell already provides the cluster and the `sheetor_test` database. Each database test starts `let Some(pool) = pool().await else { return }`, so with `TEST_DATABASE_URL` unset they log `skipped` and pass and the default gate needs no database. `tests/common` also has `user(pool)` and `song_state(title)` (a minimal song document). Run them with one:

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test
```

Tests share one database and invent unique names per case (`unique("ada")` appends nanos) rather than truncating between runs, so they are safe in parallel. `sqlx::migrate!` is idempotent, so every test file may call it.

Conventions for new tests:

- Explicit imports from `'vitest'` (`globals` is off).
- `localStorage` is stubbed per test with `vi.stubGlobal` over a `Map`-backed object; never assume a DOM.
- Web Audio is stubbed with a minimal object cast `as unknown as AudioContext`.
- Assert observable behavior (returned values, storage contents, error strings), not internals.

Verify a change by:

1. `npm run check` — vitest, then `tsc -b` plus `cargo check`, then ESLint plus clippy. Stops at the first failure. (A stale `.tsbuildinfo` can mask type errors and there is no `clean` script.)
2. Manual runtime check: `npm run dev`, then exercise the editor at `http://localhost:5173/` and Swagger at `http://localhost:5173/docs`. Playback, focus, and SVG-render changes have no automated coverage and **must** be driven in a browser. Anything touching live editing needs **two signed-in browsers with separate cookie jars** (two browser profiles, or a normal and a private window) on one song: edit in both, and check presence, cursors, a backend restart mid-edit, and a role change.

## Gotchas

- `npm run start:backend` serves `apps/frontend/dist` only if that directory exists; without `npm run build:frontend` you get the API plus a logged `frontend build missing` warning. The default dist path is baked in at compile time from `CARGO_MANIFEST_DIR`, so a relocated binary needs `FRONTEND_DIST_DIR`.
- Dev has two ports and only one of them is the app: `:5173` (Vite, with HMR and the API proxy) is the one to open. `:4000` in dev answers the API but serves whatever stale `dist` is on disk.
- `TabSheetEditor.tsx` is monolithic; prefer extracting pure helpers into `layout.ts`/`songUtils.ts` over growing it.
- The command bar is the **only** control surface; earlier duplicates (`.sheetor-toolbar`, `.sheetor-controls`, `.sheetor-footer`) were deleted, so a command is added in exactly one place. Duration-glyph SVGs are still written out per duration in the note-options panel.
- The fretboard/keyboard panel (`.sheetor-fretboard`) is `position: sticky` to just above the command bar, so over a long score it floats at the bottom of the window and at the end it settles after the score. Sticky only works while no ancestor between it and the window scrolls or clips; give one `overflow` and the panel scrolls away with the page again. Its chevron (`.panel-hide`) sets `showFretboard` false; the View menu brings it back.
- One effect keeps the edited or played bar on screen: it measures `.selection-ring` (or `.playback-line` while playing) against the band between `--header-h` and the top of whatever covers the page bottom (the panel, else the command bar), scrolls the **window** by the shortest distance while editing, and turns the page so the playing row sits at the top. The page scrolls, not the score card, which is why the old `container.scrollTo` did nothing.
- The score is not read-only: a `♩=` tempo mark swaps for an HTML `<input>` inside a `<foreignObject>` on click. Its x/y are SVG user units, so the box follows the mark without mapping screen pixels back through the `viewBox` — reuse that trick for any future in-score editor rather than overlaying an absolutely-positioned div. `.music-svg` sets `user-select: none`, so such an input needs `user-select: text` or its text cannot be selected. Editor shortcuts stay quiet because `handleKeyDown` returns early on `target.tagName === 'INPUT'`.
- Narrow number fields must not use the native spinner: `.control-input` is 64px at its widest and the reserved arrow column pushes the centred digits off-centre. `.control-input[type="number"]` kills it globally — that rule lives in `TabSheetEditor.css` but reaches the settings page, which shares the class. The transport's tempo field is `type="text"` + `inputMode="numeric"` instead, because a `type="number"` input reports `value === ''` for a partial entry, which would break its text draft.
- Playback settings are live via `settingsRef` in `usePlayback`; if you add a setting, thread it through `PlaybackSettings` or it will silently stay frozen at `start()` time.
- `computeMeasureLayouts` mutates the `MLayout` objects it returns during the stretch pass — treat the array as freshly owned, never cache it.
- No memoization anywhere (`useMemo`/`useCallback`/`React.memo` are absent): full layout + beam computation reruns every render.
- Live editing merges only what `songDoc.ts` can match by id. Code that rebuilds a track, bar or beat with a **new id** (or replaces the whole song — `executeImport`, `clearSong`) deletes and re-creates it in the shared document, so a collaborator's concurrent edit inside it is lost. Keep ids stable when editing in place.
- The editor publishes on every `song` change; `lastRemote` is what stops a received song echoing back, and the no-op diff is what stops an unchanged one producing traffic. Setting `song` from a remote update anywhere but the `onRemoteSong` listener breaks the first guard.
- Undo is Yjs's `UndoManager` inside `songChannel.ts`, tracking only `LOCAL_ORIGIN` transactions — so Ctrl+Z reverts this person's own edits and never a collaborator's (`test/features/editor/songChannel.test.ts` pins that). An undo or redo reaches the editor through `onRemoteSong` with the cursor its step was made at. A cursor move (`sendCursor`) calls `stopCapturing`, so edits at one spot within 500 ms share a step and a move starts a new one. `lastRemote` starts as the opened snapshot: otherwise the mount publish writes `parseSong`'s repairs, and they become an undo step before the user has done anything.
- A page that enters the back/forward cache keeps its WebSocket open unless something closes it; `songChannel` closes on `pagehide` and reopens on `pageshow`, otherwise collaborators see a ghost who has left.
- Anything that changes who may see a song (share, unshare, folder or song move, folder delete) must call `collab::access::refresh(state)`, or open editors keep their old role until they reconnect. A song delete closes its room with `4404` instead.
- The `Origin` check on `songs/{id}/live` compares against `PUBLIC_URL` byte for byte: a wrong port or a trailing slash in production and every live connection is refused with 403 while the REST API works.
- Drag targets are the folder tiles and every breadcrumb step, including `Library`. `dragenter` arms the highlight but `dragover` must keep calling `preventDefault()` or Chrome refuses the drop — both point at the same handler in `dropProps`. The `<select>` in each card is the keyboard equivalent; keep the two in sync when adding a move site.
- Editor state that is also a setting (`volume`, `playbackSpeed`, `loopPlayback`, `showFretboard`, `viewMode`, `midiInput`) is written back through `updateSettings` by one effect. Add a seventh and you must extend both `AppSettings` and that effect, or it will not survive a reload. Since the settings page stopped mirroring these, the editor is the **only** surface for them — a field with no control in the command bar has no UI at all.
- `defaultBpm` is exactly that case: it seeds new songs in `EditorHome.tsx`, the editor's "New song" and `LibraryPage.tsx`, but nothing edits it any more — the "New songs" section went with the rest of the non-user settings. A stored value still applies; a fresh profile is stuck at 120 until a control is added to the editor's Song menu.
- Theming has two code paths that must agree: the inline pre-paint script in `apps/frontend/index.html` and `applyTheme` in `features/user/theme.ts`. Rename the `'sheetor-user'` key or the `theme`/`accent` fields and the script silently stops working — the only symptom is a dark flash on a light-mode reload.
- The session cookie is `Secure` by default (`COOKIE_SECURE`), and a **browser accepts and returns a `Secure` cookie over `http://localhost`** because localhost is a secure context — so dev needs no override. `curl` does not, which is the only reason `COOKIE_SECURE=false` exists. In dev the cookie is attributed to `:5173` because Vite proxies `/api`, so it is same-origin. It is `SameSite=Lax` (see the boot chain); tightening it to Strict breaks SSO.
- `AuthGate` must stay inside `BrowserRouter` (`LoginPage` is rendered instead of `AppLayout`, and anything rendering a `<Link>` needs the router above it) and outside `AppLayout` (otherwise the header renders for signed-out visitors). Moving it below `AppLayout` is the easy mistake and it leaks the nav.
- Adding a colour style means three CSS blocks in `index.css` (the `[data-accent='…']` palette, its `[data-theme='light']` override written with **both** the compound and the descendant selector) plus the id in `ACCENTS` — the descendant form is what lets a settings swatch preview a palette the page is not using.
- `tuning` is per-track song data. The editor retunes through `setTuning`, which also prunes notes on strings the track no longer has (`pruneNotesToStringCount`); `parseSong` widens a fallback tuning to cover every note (`requiredStringCount`). Any new tuning-mutation site must keep both, or notes get an `undefined` pitch (`NaN`).
- Every `<select>` uses customizable select (`appearance: base-select`, in `index.css` under `@supports`), so its open list is themed like the popovers in Chromium; other browsers show their native list. The closed control is styled by its own class either way.
- `sampleSongs` in `songUtils.ts` is exported but never imported (dead data). `src/assets/react.svg` is an unreferenced template leftover, and a stale pre-monorepo `dist/` sits at the repo root — not produced by any current script.
- Time-signature validation (`checkMeasureBeats`) is advisory only: it tints the measure, it does not prevent over/under-filled bars.
- Commit history is short and free-form (`initial commit`, `made monorepo`) — not conventional commits.
