# Sheetor Monorepo

- `apps/frontend`: React + TypeScript + Vite. Three client-side routes: `/` the editor, `/library` the saved songs (in folders you can nest, with drag-and-drop filing), `/settings` the preferences.
- `apps/backend`: Rust + axum API with Swagger docs (utoipa)

## Quick start

```bash
nix develop        # or direnv allow — provides node, cargo, clippy, rustfmt, rust-analyzer, cargo-watch
npm install
npm run dev
```

`npm run dev` runs the axum backend on `:4000` and Vite on `:5173`. **Open `http://localhost:5173`** — Vite proxies `/api` and `/docs` to the backend, so there is nothing to configure in the frontend code.

- App: `http://localhost:5173/`
- Swagger: `http://localhost:5173/docs`

Or run each app separately:

```bash
npm run dev:frontend
npm run dev:backend
```

## Backend

See `apps/backend/README.md` for the crate layout and how to add an endpoint. Current endpoint:

- `GET /api/v1/health`

## Production

```bash
npm run build          # frontend dist + cargo build --release
npm run start:backend  # single port: http://localhost:4000
```

In production the backend serves `apps/frontend/dist` itself, with an `index.html` fallback for client-side routes; unknown `/api` paths return JSON `404` instead of the SPA.
