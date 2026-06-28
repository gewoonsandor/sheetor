# Sheetor Monorepo

This repository is now an npm workspaces monorepo with separate frontend and backend apps:

- `apps/frontend`: React + TypeScript + Vite
- `apps/backend`: Fastify + TypeScript API framework with Swagger docs

## Quick start

```bash
npm install
npm run dev
```

With `npm run dev`, use the backend URL for everything:

- App: `http://localhost:4000/`
- Swagger: `http://localhost:4000/docs`

Or run each app separately:

```bash
npm run dev:frontend
npm run dev:backend
```

## Backend API framework

The backend is structured to make feature growth easy:

- `src/modules/*` for feature modules and routes
- `src/plugins/*` for infrastructure plugins
- `src/config/*` for runtime config

Swagger UI is available at:

- `http://localhost:4000/docs`

During development, the backend proxies frontend requests to the Vite server so the app is available on backend root (`/`).

Current sample endpoint:

- `GET /api/v1/health`

## Build

```bash
npm run build
```
