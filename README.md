# NetlifyHub

NetlifyHub is a production-oriented web control plane for operating many Netlify accounts through the official Netlify API. This repository contains a **pnpm monorepo** with a **Fastify** API, a **Vue 3** dashboard, a **BullMQ** worker, **PostgreSQL**, and **Redis**.

[فارسی](README.fa.md)

## Features (phase 1)

- Monorepo layout (`apps/*`, `packages/*`) ready for growth
- Server-side **sessions**: random opaque id in an **HTTP-only** cookie, **SHA-256** hash stored in PostgreSQL (no JWT in the browser)
- Admin bootstrap via interactive script or optional Docker seed env vars
- Vue 3 + Vite + Naive UI, **dark / light / system** theme, **Persian / English** i18n
- Login, dashboard placeholder, profile (username + password change)
- Prisma + PostgreSQL, Redis + worker skeleton, Docker Compose stack
- Security baseline: Helmet, CORS allowlist, global + login rate limits, bcrypt password hashing, structured logging (pino), Zod validation

## Architecture

| Package                      | Role                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `@netlifyhub/api`            | HTTP API (`/v1`), auth, health                                           |
| `@netlifyhub/web`            | SPA dashboard                                                            |
| `@netlifyhub/worker`         | BullMQ consumer (placeholder jobs)                                       |
| `@netlifyhub/netlify-client` | Netlify REST client (sites, deploys, accounts, user; retries on 429/503) |
| `@netlifyhub/shared`         | Shared constants (API prefix, rate hints)                                |

The dashboard talks to the API over `/v1`. In local development the Vite dev server proxies `/v1` to the API. In Docker, the **same Fastify process** serves the built SPA from `STATIC_WEB_ROOT` (see `docker-compose.yml`) so the browser uses **one origin** (for example `http://localhost:3000`) for both UI and `/v1` — no separate reverse proxy or `VITE_API_BASE` for the default Compose stack.

Use **`@netlifyhub/netlify-client`** (or `apps/api/src/integrations/netlify`) for outbound calls to Netlify; pass a **PAT / OAuth access token** per account (from your vault in later phases — never log the token).

## Netlify API notes

Per [Netlify API documentation](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#rate-limiting), most endpoints are limited to **500 requests per minute** with stricter limits for certain operations (for example deploys). The **`@netlifyhub/netlify-client`** package retries on **429** / **503** with backoff and honors **`Retry-After`** when present; future phases will add per-account queues and caching on top. The shared package exposes `NETLIFY_DEFAULT_RATE_LIMIT_RPM = 500` as a reference constant.

## Requirements

- Node.js 22+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.14.2 --activate`)
- PostgreSQL 16+ and Redis 7+ (local or Docker)

## Install (recommended — one line, Docker)

Repository: [https://github.com/REZ3Y/NetlifyHub](https://github.com/REZ3Y/NetlifyHub)

```bash
NETLIFYHUB_INSTALL_DIR=/opt/netlifyhub bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
```

The installer will:

1. Install **git**, **curl**, and **Docker** (if missing)
2. Clone or update the repo (use `NETLIFYHUB_INSTALL_DIR` for a permanent path)
3. Ask for **panel URL**, **admin username/password**, and generate **TOKEN_ENCRYPTION_KEY**
4. Run **`docker compose up -d --build`** (Postgres, Redis, API, worker)
5. Create the first admin via seed on API startup

Open the panel at the URL you entered (default `http://YOUR_SERVER_IP:3000`).

**Developer install** (Node/pnpm on host, no Docker app stack):

```bash
NETLIFYHUB_INSTALL_MODE=dev bash install.sh
```

Use **`main`** in the curl URL only if that is your GitHub default branch. Push `install.sh` to GitHub before using the one-line command.

To install from a fork, set `NETLIFYHUB_REPO_URL` (for example `https://github.com/your-user/NetlifyHub.git`).

## Quick start (manual)

```bash
git clone https://github.com/REZ3Y/NetlifyHub.git netlifyhub && cd netlifyhub
pnpm install
cp .env.example .env
# Edit .env — DATABASE_URL, REDIS_URL, WEB_ORIGIN (e.g. http://localhost:5173), TOKEN_ENCRYPTION_KEY

pnpm run docker:local   # optional: Postgres + Redis in Docker
pnpm db:migrate
pnpm --filter @netlifyhub/api run create-admin
pnpm dev
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## Docker (manual)

Same as the one-line installer, or:

1. `cp .env.docker.example .env` and edit `WEB_ORIGIN`, `TOKEN_ENCRYPTION_KEY`, `SEED_ADMIN_*`
2. `docker compose up -d --build`

The API entrypoint runs migrations and seed. When `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` are set and the database has no users, seed creates an `ADMIN` user.

- Web UI + API: `http://localhost:3000` (single container serves SPA + `/v1`)

Docker Compose reads the repo-root `.env` for **`VITE_APP_TITLE`** when building the **API** image (the Vue bundle is built in that Dockerfile). Set **`WEB_ORIGIN`** to the exact URL you open in the browser (default `http://localhost:3000`).

## Environment variables

See `.env.example` at the repository root (single file for API, worker, and web). Highlights:

| Variable               | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                                            |
| `REDIS_URL`            | Redis connection URL (API + worker)                                     |
| `SESSION_TTL_DAYS`     | Cookie/session lifetime in days (default `7`)                           |
| `WEB_ORIGIN`           | Exact browser origin allowed by CORS                                    |
| `COOKIE_SECURE`        | `true` / `false`; defaults from `NODE_ENV`                              |
| `STATIC_WEB_ROOT`      | Optional path to Vite `dist`; when set, Fastify serves the SPA (Docker) |
| `TOKEN_ENCRYPTION_KEY` | Optional 32+ chars for encrypting Netlify tokens at rest (later phases) |

## Development scripts

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `pnpm dev`        | Run API, web, and worker in watch mode |
| `pnpm build`      | Build all packages                     |
| `pnpm lint`       | ESLint across workspaces               |
| `pnpm format`     | Prettier write                         |
| `pnpm db:migrate` | `prisma migrate deploy` (API schema)   |

## Security

- Passwords are hashed with bcrypt (configurable cost).
- Session identifiers are opaque random strings stored as **SHA-256** hashes in PostgreSQL; the browser only keeps the raw id in an HTTP-only cookie.
- Netlify personal access tokens will be encrypted at rest in a future phase using `TOKEN_ENCRYPTION_KEY` (never commit real secrets).
- OWASP-minded defaults: Helmet, strict CORS, validation, login brute-force throttling, audit-friendly request IDs in logs.

## Roadmap (high level)

1. **Phase 1 (current):** Monorepo, auth, UX shell, Docker, worker skeleton.
2. **Phase 2:** Extend `@netlifyhub/netlify-client` usage, per-account token vault (encryption), proxy configuration surface.
3. **Phase 3:** Sync jobs + BullMQ processors, cached read models in PostgreSQL, adaptive scheduling respecting Netlify rate limits.
4. **Phase 4:** Deploy / delete / monitoring flows, RBAC, audit log UI.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
