# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
RUN npm ci
COPY apps/frontend apps/frontend
RUN npm run build:frontend

FROM rust:1-bookworm AS api
WORKDIR /src
# Queries are checked against the committed .sqlx data, so no database is needed here.
ENV SQLX_OFFLINE=true
COPY Cargo.toml Cargo.lock ./
COPY .sqlx .sqlx
COPY apps/backend apps/backend
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked \
 && cp target/release/sheetor-backend /usr/local/bin/sheetor-backend

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --home /app sheetor
WORKDIR /app
COPY --from=api /usr/local/bin/sheetor-backend /app/sheetor-backend
COPY --from=web /src/apps/frontend/dist /app/dist
ENV HOST=0.0.0.0 PORT=4000 FRONTEND_DIST_DIR=/app/dist
USER sheetor
EXPOSE 4000
CMD ["/app/sheetor-backend"]
