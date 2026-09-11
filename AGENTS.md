# Repository Guidelines

## Project Overview

Sheetor is an interactive guitar TAB + sheet-music editor with in-browser playback. npm-workspaces monorepo:

- `apps/frontend` — React 19 SPA (Vite), the entire product surface.
- `apps/backend` — Rust axum API + Swagger (utoipa), and in production the single user-facing HTTP entry point (it serves the built SPA).

The editor is currently **offline-first**: no frontend code calls the backend. Songs live in `localStorage`. The backend exists as an API scaffold (`GET /api/v1/health`) plus prod SPA host.

## Architecture & Data Flow

### Serving topology

`npm run dev` starts both processes with `concurrently`. In dev the browser talks to **Vite on `http://localhost:5173`**, which proxies `/api` and `/docs` to axum on `:4000`. In production there is one port: axum serves the built SPA itself on `:4000`.

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

`src/main.rs` (config, tracing, `TcpListener`, `axum::serve`) → `src/app.rs` `build(&Config)`. The order inside `build` is **load-bearing**:

1. `api::router(AppState::default())` → the `/api/v1`-nested router plus the collected `OpenApi`.
2. `/api` and `/api/{*path}` catch-alls → JSON `{"message":"Not Found"}`, so an unknown API path never falls through to the SPA.
3. `SwaggerUi::new("/docs").url("/docs/openapi.json", openapi)`.
4. `frontend::serve` — installs the SPA `fallback_service`; it must stay last because it claims everything unmatched.
5. `TraceLayer` wraps the finished router.

There is no plugin system: `src/api/<feature>.rs` holds handlers with their `#[utoipa::path]`, and `src/api/mod.rs` is the only place `/api/v1` and the tag list exist.

### Frontend data flow

Mount chain: `index.html#root` → `src/main.tsx` (`createRoot` + `StrictMode`) → `src/App.tsx` (`BrowserRouter`) → `src/app/layout/AppLayout.tsx` → `src/app/ErrorBoundary.tsx` → the routed page. Three routes, all client-side: `/` → `features/editor/pages/EditorPage.tsx` → `TabSheetEditor.tsx`, `/library` → `features/library/pages/LibraryPage.tsx`, `/settings` → `features/settings/pages/SettingsPage.tsx`; anything unmatched falls back to the editor. The open library folder is the `?folder=<id>` search param (`useSearchParams`), not component state, so browser back walks out of a folder and a link opens one; an id that names no folder renders the root. `react-router-dom` is the only routing dependency — still no context and no providers. Deep links survive a hard reload because axum's SPA fallback serves `index.html` for unknown paths.

- **State**: ~20 `useState` hooks inside `TabSheetEditor.tsx` — the whole app, minus playback. No `useReducer`, no store library. `usePlayback` is the only custom hook.
- **Mutation**: every edit is a named closure using `setSong(prev => …)` with immutable `map`/spread rebuilds. `updateActiveBeatNotes` is the shared primitive behind fret entry, technique toggles, and note removal.
- **Persistence**: three stores, all `localStorage`, all validating at the boundary.
  - `features/library/libraryStore.ts` owns key `'sheetor-library'` — `{ entries: LibraryEntry[]; folders: LibraryFolder[]; currentId: string | null }`, entries newest-touched first. Every mutator (`addSong`, `replaceSong`, `duplicateSong`, `deleteSong`, `moveSong`, `setCurrentSong`, `createFolder`, `renameFolder`, `moveFolder`, `deleteFolder`) is pure: it takes a `Library` and returns a new one — the same reference when nothing changed — and the caller decides when to `saveLibrary`. An entry whose song fails validation is **dropped**; an unusable blob is quarantined to `'sheetor-library.invalid'`. On first load with no library it migrates the pre-library key `'sheetor-song'` into a single entry and removes it.
  - **Folders are flat**: `LibraryFolder { id, name, parentId }` plus `entry.folderId`, both `null` at the root. The tree is only ever *derived* — `folderPath`, `childFolders` (name-sorted), `songsIn` (stored order), `countSongsIn` (whole subtree), `folderChoices` (depth-first, `excludeSubtreeId` for the set a folder may not move into) — so a move is a one-field edit and no mutator rewrites a nested structure. `moveFolder` refuses a cycle; `deleteFolder` **never deletes a song**, it reparents the folder's children and songs one level up.
  - `features/settings/settingsStore.ts` owns key `'sheetor-settings'` (`AppSettings`: `masterVolume`, `playbackSpeed`, `loopPlayback`, `showToolPanel`, `readOnly`, `defaultBpm`). Validation is **field by field** — one bad value can never discard the rest.
  - `features/user/userStore.ts` owns key `'sheetor-user'` (`User`: `id`, `name`, `email`, `theme`, `accent`) — the local "dummy" profile; there is no sign-in and nothing is sent anywhere. Same field-by-field validation, plus a module-level cache so `getUserSnapshot` can feed `useSyncExternalStore` a stable reference, and a `subscribeUser` listener set so the header chip and the settings page never disagree. `loadUser()` is the single seam a future `GET /api/v1/user` would replace.
  - The editor takes one snapshot of the library and the settings at mount (the `session` state), autosaves the open song with `useEffect(() => saveLibrary(replaceSong(…)), [song, songId])`, and writes the five shared playback/panel values back through `updateSettings` when they change, so the settings page and the transport never disagree. `tuning` is still per-track song data; `synthType` and the remaining UI flags reset on reload.
- **Playback**: owned entirely by `usePlayback.ts` (raw Web Audio API). `requestAnimationFrame` lookahead scheduler (100 ms) advancing `nextBeatTimeRef`; cursor position advances through `nextBeatPosition`, which always terminates. Every setting (`song`, `tuning`, `volume`, `synthType`, `loop`, `speed`) is read through `settingsRef`, refreshed by a dependency-less effect after each render, so mid-playback changes take effect on the next scheduled beat. `synthType === 'guitar'` uses the Karplus-Strong buffer from `audioEngine.ts`, otherwise an `OscillatorNode` + ADSR gain.
- **Rendering**: notation is one inline `<svg className="music-svg">` with a computed `viewBox` and hand-written `<path>` glyphs (clef, flags, beams); the virtual fretboard is DOM `<div>`s with computed inline styles. No canvas, no VexFlow/alphaTab.
- **Geometry**: `layout.ts` is pure, React-free, and owns all constants (`MAX_ROW_WIDTH 980`, `TAB_STAFF_TOP 90`, `FRET_COUNT 15`, …) plus `computeMeasureLayouts` two-pass line breaking/stretching.
- **Theming**: `<html>` carries two independent attributes — `data-theme="light|dark"` (lightness ladder + ink polarity) and `data-accent="amber|teal|indigo|violet|rose"` (neutral tint + accent triplet). `features/user/theme.ts` is the only module that touches `documentElement`; `main.tsx` calls `applyTheme(loadUser())` once, then re-applies on every `subscribeUser` notification and every `prefers-color-scheme` change, so no component ever writes the attributes. An inline script in `index.html` sets them during head parse to kill the first-paint flash — keep its `'sheetor-user'` key and field names in sync with the store.

## Key Directories

| Path | Purpose |
|---|---|
| `apps/backend/src/api/` | `mod.rs` (`/api/v1` nesting, `ApiDoc` tags, `not_found`) plus one file per feature |
| `apps/backend/src/` | `main.rs`, `app.rs` (router assembly), `config.rs`, `state.rs`, `frontend.rs` |
| `apps/frontend/src/app/layout/` | `AppLayout` + `AppHeader` (logo and the three `NavLink`s), presentational only |
| `apps/frontend/src/features/editor/components/` | The editor **and** its pure modules (`types.ts`, `layout.ts`, `songUtils.ts`, `songSchema.ts`, `audioEngine.ts`, `usePlayback.ts`) plus their `*.test.ts` files |
| `apps/frontend/src/features/editor/pages/` | `EditorPage.tsx` (5 lines of indirection) |
| `apps/frontend/src/features/library/` | `libraryStore.ts` + test, `LibraryPage.css`, `pages/LibraryPage.tsx` |
| `apps/frontend/src/features/settings/` | `settingsStore.ts` + test, `SettingsPage.css`, `pages/SettingsPage.tsx` |
| `apps/frontend/src/features/user/` | `userStore.ts` + test, `theme.ts` + test — the local profile and the only DOM-writing theme code; no page of its own |

Note the shape gotcha: the editor's non-component modules sit under `components/`, not at `features/editor/`. The two newer features do **not** copy that — their stores sit at the feature root (`features/library/libraryStore.ts`) with only the page under `pages/`. Prefer the newer shape. There is no `shared/`, `lib/`, or `utils/` directory.

## Development Commands

```bash
npm install                 # root only — the npm workspace is apps/frontend
npm run dev                 # cargo watch + vite; use http://localhost:5173
npm run dev:backend         # cargo watch -q -c -w apps/backend -x run  (:4000)
npm run dev:frontend        # vite (:5173, strictPort), proxies /api + /docs to :4000
npm run build               # frontend dist, then cargo build --release
npm run lint                # eslint (frontend) + cargo clippy -D warnings
npm run typecheck           # tsc -b (frontend) + cargo check --all-targets
npm test                    # vitest run (pure modules) + cargo test
npm run start:backend       # cargo run --release — one port, :4000
```

Every command needs the dev shell (`nix develop`, or direnv) for `cargo`/`cargo-watch`.

Verification gates, exactly:

```bash
npm test                                        # vitest run — pure modules
npm run typecheck                               # tsc -b + cargo check
npm run lint                                    # ESLint + clippy
npm run build && npm run start:backend          # axum serves dist on :4000
curl -s localhost:4000/api/v1/health            # smoke
```

`npm run lint` currently emits one pre-existing `react-hooks/exhaustive-deps` warning (the auto-scroll effect) and exits 0.

## Code Conventions & Common Patterns

### Backend (Rust)

- Edition 2024, one crate (`sheetor-backend`) in a root Cargo workspace; `cargo fmt` and `cargo clippy --all-targets -- -D warnings` are clean and are the gate. No `unsafe`, no comments.
- Adding a feature module:

  ```rust
  // src/api/songs.rs
  #[derive(Serialize, ToSchema)]
  pub struct Song { /* … */ }

  #[utoipa::path(get, path = "/songs", tag = "songs", summary = "List songs",
      responses((status = 200, body = Vec<Song>)))]
  pub async fn list(State(state): State<AppState>) -> Json<Vec<Song>> { /* … */ }
  ```

  Then `mod songs;` and `.routes(routes!(songs::list))` in `src/api/mod.rs`, and add the tag to `ApiDoc`'s `tags(…)`. `path` is prefix-relative — never hardcode `/api/v1` in a handler; `api::router`'s `nest` applies it once, to both the routes and the spec.
- Handlers return `Json<T>`/`impl IntoResponse`; the `#[utoipa::path]` attribute sits on the handler so `routes!` can collect method, path, and schema together. utoipa validates nothing at runtime — the return type is the contract.
- Shared runtime values live in `AppState` (`src/state.rs`) and are reached with the `State` extractor. It is `Copy` today; anything non-`Copy` goes behind an `Arc`.
- Config: extend `Config` in `src/config.rs` instead of reading `std::env` inline. It is built once, in `main`, and passed by reference.
- Errors are hand-rolled and minimal: `api::not_found` is the only one. No error type, no CORS layer, no auth, no graceful shutdown.

### Frontend

- ESM (`"type": "module"`); named exports are the norm (`App` and `TabSheetEditor` are the only default exports).
- `import type { … }` for every type-only import (`verbatimModuleSyntax` is on).
- Arrow-function consts with explicit return annotations for module-level functions.
- No path aliases in any tsconfig — **relative imports only**. TypeScript is pinned `~5.9.3`.
- Function components only; arrow + named export (`export const AppHeader = () => …`). `React.FC` appears once; there is no established `type Props = …` convention (`AppLayout({ children }: PropsWithChildren)` is the only props-taking component).
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
- `duration` is a string union `'1'|'2'|'4'|'8'|'16'|'32'` — convert with `getDurationVal` (quarter = 1.0, dot = ×1.5), never arithmetic on the literal. The union is re-spelled inline in ~12 signatures instead of a named alias; changing durations touches all of them.
- `TabMeasure.bpm`/`timeSignature` are optional overrides resolved by backward scan (`getEffectiveBpm`, `getEffectiveTimeSignature`) falling back to the `TabSong` values.
- IDs are the inline expression `Math.random().toString(36).substring(2, 9)`, duplicated in 15+ places across `TabSheetEditor.tsx` and `songUtils.ts`; no helper exists.

## Important Files

| File | Role |
|---|---|
| `apps/backend/src/main.rs` / `app.rs` | Process entry / `build(&Config)` and its registration order |
| `apps/backend/src/config.rs` | `Config::from_env` — the whole runtime config surface |
| `apps/backend/src/frontend.rs` | `ServeDir` + SPA fallback, mounted only when `dist` exists |
| `apps/backend/src/api/mod.rs` | Sole `/api/v1` prefix site, `ApiDoc` tags, JSON `not_found` |
| `apps/backend/src/api/health.rs` | Canonical route template |
| `Cargo.toml` (root) | Cargo workspace, `members = ["apps/backend"]`, shared `target/` |
| `apps/frontend/src/App.tsx` | `BrowserRouter` and the three routes |
| `apps/frontend/src/features/library/libraryStore.ts` | The song library: pure mutators, validation, legacy migration |
| `apps/frontend/src/features/settings/settingsStore.ts` | `AppSettings` with field-by-field validation |
| `apps/frontend/src/features/user/userStore.ts` | The local profile: `User`, the palette/theme enums, the subscription the header and settings page share |
| `apps/frontend/src/features/user/theme.ts` | `resolveTheme`/`applyTheme`/`watchSystemTheme` — the only code that writes `data-theme`/`data-accent` |
| `apps/frontend/src/features/editor/components/TabSheetEditor.tsx` | The application (state, keyboard, SVG render) |
| `apps/frontend/src/features/editor/components/usePlayback.ts` | All playback: scheduler, voices, transport state |
| `apps/frontend/src/features/editor/components/songSchema.ts` | `parseSong` — the only validation boundary for stored/imported songs |
| `apps/frontend/src/features/editor/components/layout.ts` | Pure layout geometry |
| `apps/frontend/src/features/editor/components/songUtils.ts` | Music theory, beaming, MIDI ↔ note names, `createId`/`createEmptySong`, beat-position walking |
| `apps/frontend/vite.config.ts` | `port: 5173, strictPort: true` + the dev proxy of `/api` and `/docs` to `:4000` |
| `apps/frontend/vitest.config.ts` | `include: ['src/**/*.test.ts']`, `environment: 'node'` |
| `apps/frontend/eslint.config.js` | ESLint 9 flat config (frontend only) |

### Environment variables (all backend, all optional)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | Parsed as `u16`; unparsable or `0` falls back |
| `HOST` | `0.0.0.0` | |
| `LOG_LEVEL` | `info` | Used as the `EnvFilter` directive; `RUST_LOG` overrides it entirely |
| `FRONTEND_DIST_DIR` | `<crate>/../frontend/dist` | Compile-time default from `CARGO_MANIFEST_DIR`; set it when the binary is deployed elsewhere |

No `.env` file exists, nothing loads one (no `dotenvy`), and `.gitignore` does **not** ignore `.env*` — do not commit one without adding the pattern.

## Runtime/Tooling Preferences

- **npm is the package manager** (single root `package-lock.json`, `lockfileVersion: 3`). No Bun, pnpm, or yarn anywhere; no `packageManager` or `engines` field. Install from the repo root, never inside a workspace.
- Node ≥ 20 in practice (`@types/node` ^24, NodeNext ESM); unpinned.
- `vite` is aliased to **`npm:rolldown-vite@7.2.5`**, not upstream Vite. Plugin/version advice must account for the Rolldown build.
- Frontend runtime dependencies are exactly `react`, `react-dom` and `react-router-dom`. There is no UI kit, icon package, date library or state library — icons are hand-inlined SVG and relative timestamps are a local helper in `LibraryPage.tsx`.
- Backend dev is `cargo watch -x run`: a debug rebuild per save, no separate dev runtime. Prod is `cargo build --release` → `target/release/sheetor-backend`.
- The Rust toolchain comes from `flake.nix` (nixpkgs stable: `rustc`, `cargo`, `clippy`, `rustfmt`, `rust-analyzer`, `cargo-watch`) — no `rustup`, no `rust-toolchain.toml`. Edition 2024, workspace `resolver = "3"`, one `Cargo.lock` and one `target/` at the repo root.
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

Vitest 3 is installed in the **frontend workspace only** (`vitest run`, config at `apps/frontend/vitest.config.ts`). Tests are colocated as `src/**/*.test.ts` and cover the pure modules — `songUtils`, `songSchema`, `audioEngine`, `libraryStore`, `settingsStore`, `userStore`, `theme` (180 tests). There is no jsdom, no component/DOM testing library, and no coverage gate: anything needing a browser is verified by hand. The backend has **no tests yet** — `cargo test` runs zero; add integration tests under `apps/backend/tests/` and drive `app::build` with `tower::ServiceExt::oneshot`.

Conventions for new tests:

- Explicit imports from `'vitest'` (`globals` is off).
- `localStorage` is stubbed per test with `vi.stubGlobal` over a `Map`-backed object; never assume a DOM.
- Web Audio is stubbed with a minimal object cast `as unknown as AudioContext`.
- Assert observable behavior (returned values, storage contents, error strings), not internals.

Verify a change by:

1. `npm test` — pure-module behavior.
2. `npm run typecheck` — `tsc -b` for the frontend (stale `.tsbuildinfo` can mask errors and no `clean` script exists) plus `cargo check`.
3. `npm run lint` — frontend ESLint plus clippy.
4. Manual runtime check: `npm run dev`, then exercise the editor at `http://localhost:5173/` and Swagger at `http://localhost:5173/docs`. Playback, focus, and SVG-render changes have no automated coverage and **must** be driven in a browser.

## Gotchas

- `npm run start:backend` serves `apps/frontend/dist` only if that directory exists; without `npm run build:frontend` you get the API plus a logged `frontend build missing` warning. The default dist path is baked in at compile time from `CARGO_MANIFEST_DIR`, so a relocated binary needs `FRONTEND_DIST_DIR`.
- Dev has two ports and only one of them is the app: `:5173` (Vite, with HMR and the API proxy) is the one to open. `:4000` in dev answers the API but serves whatever stale `dist` is on disk.
- `TabSheetEditor.tsx` is monolithic; prefer extracting pure helpers into `layout.ts`/`songUtils.ts` over growing it.
- The command bar is the **only** control surface; earlier duplicates (`.sheetor-toolbar`, `.sheetor-controls`, `.sheetor-footer`) were deleted, so a command is added in exactly one place. Duration-glyph SVGs are still written out per duration in the note-options panel.
- Playback settings are live via `settingsRef` in `usePlayback`; if you add a setting, thread it through `PlaybackSettings` or it will silently stay frozen at `start()` time.
- `computeMeasureLayouts` mutates the `MLayout` objects it returns during the stretch pass — treat the array as freshly owned, never cache it.
- No memoization anywhere (`useMemo`/`useCallback`/`React.memo` are absent): full layout + beam computation reruns every render.
- `libraryStore.ts` quarantines an unusable `sheetor-library` to `sheetor-library.invalid` and drops individual entries whose song fails `parseSong`. Neither store has a schema *version*, so shape migrations are repair rules at parse time — in `parseSong` for songs, in `parseEntry`/`parseFolders`/`readSettings` for the wrappers. The pre-library `sheetor-song` key is migrated once and then deleted; `sheetor-song.invalid` is left alone.
- Folder repair is deliberately minimal and happens only in `parseFolders`: a duplicate folder id is dropped, a missing parent or a folder that *closes* a cycle is reparented to the root, and a folder merely hanging below one keeps its parent (it becomes rooted once its ancestor is cut). A song pointing at a folder that no longer exists goes back to the root. Nothing is deleted, so `folderId`/`parentId` can never strand a song.
- Drag targets are the folder tiles and every breadcrumb step, including `Library`. `dragenter` arms the highlight but `dragover` must keep calling `preventDefault()` or Chrome refuses the drop — both point at the same handler in `dropProps`. The `<select>` in each card is the keyboard equivalent; keep the two in sync when adding a move site.
- Editor state that is also a setting (`volume`, `playbackSpeed`, `loopPlayback`, `showFretboard`, `viewMode`) is written back through `updateSettings` by one effect. Add a sixth and you must extend both `AppSettings` and that effect, or the settings page will silently disagree with the transport.
- Theming has two code paths that must agree: the inline pre-paint script in `apps/frontend/index.html` and `applyTheme` in `features/user/theme.ts`. Rename the `'sheetor-user'` key or the `theme`/`accent` fields and the script silently stops working — the only symptom is a dark flash on a light-mode reload.
- Adding a colour style means three CSS blocks in `index.css` (the `[data-accent='…']` palette, its `[data-theme='light']` override written with **both** the compound and the descendant selector) plus the id in `ACCENTS` — the descendant form is what lets a settings swatch preview a palette the page is not using.
- `tuning` is UI state and is not persisted. It is widened on load/import (`requiredStringCount`) and shrinking it prunes stranded notes (`pruneNotesToStringCount`); any new tuning-mutation site must do both or notes get an `undefined` pitch (`NaN`).
- `sampleSongs` in `songUtils.ts` is exported but never imported (dead data). `src/assets/react.svg` is an unreferenced template leftover, and a stale pre-monorepo `dist/` sits at the repo root — not produced by any current script.
- Time-signature validation (`checkMeasureBeats`) is advisory only: it tints the measure, it does not prevent over/under-filled bars.
- Commit history is short and free-form (`initial commit`, `made monorepo`) — not conventional commits.
