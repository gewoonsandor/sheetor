# Sheetor

**A guitar TAB and sheet-music editor your band can write in together, live.**

![Sheetor editor with notation, TAB and the fretboard](docs/screenshots/editor.png)

Sheetor puts standard notation and guitar TAB on one score, plays it back in the browser, and
keeps every song on your own server. Share a folder with your bandmates and you are all in the
same song at once: every note, bar and title change lands on everyone's screen as it is typed,
and you can see where each person is working.

## Features

- **Notation and TAB together.** Each track picks its instrument (guitar, bass, piano, strings,
  synths and more) and shows notes, TAB or both. Fretted tracks follow their tuning, and
  switching an instrument rewrites every note by its sounding pitch.
- **Plays in the browser.** Tempo and metre changes per bar, repeat signs with any number of
  plays, loop, speed control, a plucked-string synth for guitars, and an interactive fretboard or
  piano for entering notes.
- **Copy and paste.** Shift-select beats or whole bars and copy, cut or paste them, within a song
  or into another one; notes pasted onto a different tuning or instrument keep their pitch.
- **MIDI keyboard input.** Plug in a digital piano or controller and play into the score: each
  note lands on the cursor and moves it on, and keys held together become a chord. Works in
  Chrome, Edge and Firefox.
- **A library on the server.** Nested folders, drag-and-drop filing, duplicates, and recent-first
  listing that tells you who touched a song last.
- **Folder sharing with roles.** Share a folder, and everything inside it, with anyone who has an
  account. *Editors* write with you; *viewers* watch.
- **Real-time co-editing.** Built on a CRDT (Yjs), so simultaneous edits merge instead of
  overwriting each other. Presence chips and coloured cursors show who is where, and edits made
  while a connection drops are merged once it comes back.
- **Single sign-on.** Any OpenID Connect provider, such as Authentik or Keycloak. Email-and-password
  sign-in can be switched off for an SSO-only deployment.
- **One container, one port.** The Rust server hosts the app, the API, live sessions and the
  API docs (Swagger at `/docs`). All it needs is PostgreSQL.

## Screenshots

**Two people in one song.** Ben's view while Ada works in bar 2: her cursor and her chip in the
header update as she moves.

![Ben's editor showing Ada's cursor and presence chip](docs/screenshots/collaboration.png)

**Shared with me.** Folders other people shared with you get their own shelf, labelled with the
owner and your role.

![Library with a Shared with me section](docs/screenshots/library.png)

**Sharing a folder** takes an email address and a role, and can be changed or revoked at any time.
Changes take effect in open editors immediately.

![The share dialog](docs/screenshots/share.png)

**Sign-in** with your identity provider, with or without local accounts.

![Sign-in page with a single sign-on button](docs/screenshots/login.png)

## Quick start with Docker

```bash
docker network create sheetor
docker run -d --name sheetor-db --network sheetor \
  -e POSTGRES_PASSWORD=sheetor -e POSTGRES_DB=sheetor \
  -v sheetor-db:/var/lib/postgresql/data postgres:17
docker build -t sheetor .
docker run -d --name sheetor --network sheetor -p 4000:4000 \
  -e DATABASE_URL=postgres://postgres:sheetor@sheetor-db/sheetor \
  -e PUBLIC_URL=http://localhost:4000 \
  sheetor
```

Open <http://localhost:4000> and create an account. The schema is created on first start.

The same setup with Compose:

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: sheetor
      POSTGRES_DB: sheetor
    volumes:
      - sheetor-db:/var/lib/postgresql/data
  sheetor:
    build: .
    ports:
      - "4000:4000"
    environment:
      DATABASE_URL: postgres://postgres:sheetor@db/sheetor
      PUBLIC_URL: http://localhost:4000
    depends_on:
      - db
volumes:
  sheetor-db:
```

## Configuration

Everything is configured through environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string. |
| `PUBLIC_URL` | `http://localhost:<PORT>` | The exact origin people open in their browser, e.g. `https://sheetor.example.com`. Live editing refuses WebSocket connections from any other origin, and the SSO callback is `PUBLIC_URL/api/v1/auth/sso/callback`. |
| `HOST` | `0.0.0.0` | Listen address. |
| `PORT` | `4000` | Listen port. |
| `COOKIE_SECURE` | `true` | Marks the session cookie `Secure`. Browsers accept it on `http://localhost`; set `false` only to drive the API over plain HTTP with `curl`. |
| `LOG_LEVEL` | `info` | Log filter; `RUST_LOG` overrides it. |
| `FRONTEND_DIST_DIR` | `/app/dist` in the image | Where the built frontend lives. |
| `OIDC_ISSUER_URL` | unset | Issuer of your OpenID Connect provider. Setting it turns single sign-on on. |
| `OIDC_CLIENT_ID` | required with SSO | Client id registered at the provider. |
| `OIDC_CLIENT_SECRET` | required with SSO | Client secret (a confidential client). |
| `OIDC_DISPLAY_NAME` | `Single sign-on` | Button label: "Continue with …". |
| `LOCAL_AUTH_ENABLED` | `true` | `false` hides email-and-password sign-in and sign-up, and the API refuses them. Ignored when no provider is configured, so you cannot lock everyone out. |

TLS belongs in a reverse proxy in front of Sheetor. The proxy must pass WebSocket upgrades for
`/api/v1/songs/*/live`, which is where live editing happens.

## Single sign-on

Register Sheetor as a confidential client using the Authorization Code flow, with the redirect URI
`https://<your-host>/api/v1/auth/sso/callback` (that is, `PUBLIC_URL` plus that path). Sheetor
requests the scopes `openid email profile` and uses PKCE.

**Authentik.** Create an *OAuth2/OpenID Provider* (client type *Confidential*, the redirect URI
above) and an *Application* that uses it. The issuer is
`https://<authentik>/application/o/<application-slug>/`.

**Keycloak.** In your realm, create a client of type *OpenID Connect* with *Client
authentication* on and *Standard flow* enabled, and add the redirect URI. The issuer is
`https://<keycloak>/realms/<realm>`, and the secret is on the client's *Credentials* tab.

```bash
OIDC_ISSUER_URL=https://auth.example.com/realms/music
OIDC_CLIENT_ID=sheetor
OIDC_CLIENT_SECRET=…
OIDC_DISPLAY_NAME=Keycloak
LOCAL_AUTH_ENABLED=false   # optional: SSO only
```

**Accounts.** A person's first sign-in creates their account from the provider's email and
name. If an account with that email already exists, it is linked only when the provider marks
the address as **verified**; otherwise sign-in is refused, so nobody can claim someone else's
account by registering their address at a provider that does not check it.

## How collaboration works

- Every song and folder belongs to one **owner**. The owner shares a folder, and the share covers
  everything inside it, including subfolders and songs added later.
- **Editors** can open, edit, create, rename, move and delete songs and folders inside the share.
  **Viewers** can open and watch. Only the owner shares, unshares and deletes folders; anyone may
  leave a folder shared with them.
- Anything created inside a shared folder stays in the owner's library, and items only move
  within one owner's library, so sharing never scatters a band's songs across accounts.
- Songs are [Yjs](https://yjs.dev) documents. Each change travels as a small update over a
  WebSocket and is merged by every client and the server, so two people editing different bars,
  or even the same bar, never overwrite each other. The server saves a song two seconds after it
  changes and whenever the last person leaves it.
- Changing a role or removing a share applies to open editors at once: they switch to view-only,
  or close with a notice.
- Live sessions are held in the server's memory, so run **one** Sheetor instance per database.

## Development

Requires Nix with flakes; the dev shell provides Node, the Rust toolchain, `sqlx-cli` and a
local PostgreSQL that starts on first entry.

```bash
direnv allow            # or: nix develop
npm install
npm run dev             # axum on :4000, Vite on :5173; open http://localhost:5173
npm run check           # vitest, tsc, cargo check, eslint, clippy
TEST_DATABASE_URL=postgres://postgres@127.0.0.1/sheetor_test cargo test   # database tests
```

SQL is checked at compile time. After changing a query, refresh the offline data the Docker
build uses:

```bash
cargo sqlx prepare --workspace -- --all-targets
```

## Architecture

```mermaid
graph LR
  B[Browser] -->|REST /api/v1| A[axum server]
  B <-->|WebSocket: Yjs updates, presence| A
  B -->|/ static app| A
  A --> P[(PostgreSQL)]
  A <-->|OpenID Connect| I[Identity provider]
```

The React app talks to the axum server over REST for the library and over one WebSocket per open
song. The server keeps each open song as a live Yjs document, relays updates between the people
in it, and writes it to PostgreSQL. Conventions and layout for contributors are in
[`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) © 2026 Sandor van Wieringen
