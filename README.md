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

| Package              | Role                                      |
| -------------------- | ----------------------------------------- |
| `@netlifyhub/api`    | HTTP API (`/v1`), auth, health            |
| `@netlifyhub/web`    | SPA dashboard                             |
| `@netlifyhub/worker` | BullMQ consumer (placeholder jobs)        |
| `@netlifyhub/shared` | Shared constants (API prefix, rate hints) |

The dashboard talks to the API over `/v1`. In local development the Vite dev server proxies `/v1` to the API. In Docker, the static web image is served with **Node `serve`**; the browser calls the API using **`VITE_API_BASE`** (see `.env.docker.example`), so set it to the URL users will use to reach the API (for example `http://localhost:3000` when publishing ports `8080` and `3000` on the same host).

## Netlify API notes

Per [Netlify API documentation](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#rate-limiting), most endpoints are limited to **500 requests per minute** with stricter limits for certain operations (for example deploys). Later phases will add a dedicated Netlify client with per-account queues, caching, and exponential backoff; the shared package already exposes `NETLIFY_DEFAULT_RATE_LIMIT_RPM = 500` as a reference constant.

## Requirements

- Node.js 22+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.14.2 --activate`)
- PostgreSQL 16+ and Redis 7+ (local or Docker)

## Install (recommended — one line)

Repository: [https://github.com/REZ3Y/NetlifyHub](https://github.com/REZ3Y/NetlifyHub)

```bash
bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
```

Use **`main`** in the URL only if that is your GitHub default branch; if the default is **`master`**, replace `main` with `master`. The file **`install.sh` must exist at the repository root** on GitHub (push your local copy if the one-line command returns HTTP 404).

This clones [https://github.com/REZ3Y/NetlifyHub.git](https://github.com/REZ3Y/NetlifyHub.git), installs dependencies, runs migrations (PostgreSQL must match `DATABASE_URL` in `apps/api/.env`), and launches the interactive admin bootstrap.

If you previously saw `404:: command not found`, you were missing **`curl -f`**: without it, curl prints GitHub’s error body and bash tries to run it as a script.

To install from a fork or mirror, set `NETLIFYHUB_REPO_URL` before the command (for example `https://github.com/your-user/NetlifyHub.git`).

If you already cloned the repository, run `bash install.sh` or `bash scripts/install.sh` from the repo root instead.

## Quick start (manual)

```bash
git clone https://github.com/REZ3Y/NetlifyHub.git netlifyhub && cd netlifyhub
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
# Edit apps/api/.env — set DATABASE_URL, REDIS_URL, WEB_ORIGIN (e.g. http://localhost:5173), optional SESSION_TTL_DAYS

pnpm --filter @netlifyhub/api exec prisma migrate deploy
pnpm --filter @netlifyhub/api run create-admin
pnpm dev
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## Docker

1. Copy `.env.docker.example` to `.env` in the repo root (adjust `WEB_ORIGIN` if needed).
2. `docker compose up -d --build`
3. Optionally seed the first admin without an interactive shell:

```bash
# Add to .env then recreate the api container, or pass inline for a one-off run:
docker compose run --rm -e SEED_ADMIN_USERNAME=admin -e SEED_ADMIN_PASSWORD='your-secure-password' api \
  sh -lc "pnpm --filter @netlifyhub/api exec prisma migrate deploy && pnpm --filter @netlifyhub/api exec prisma db seed && exit 0"
```

The normal `api` service entrypoint already runs `prisma migrate deploy` and `prisma db seed` on startup. When `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` are set and no users exist, seed creates an `ADMIN` user.

- Web UI (Compose): `http://localhost:8080` (static SPA; API is `VITE_API_BASE`, default `http://localhost:3000`)
- API: `http://localhost:3000`

## Environment variables

See `apps/api/.env.example`, `apps/worker/.env.example`, and `apps/web/.env.example`. Highlights:

| Variable               | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                                            |
| `REDIS_URL`            | Redis connection URL (API + worker)                                     |
| `SESSION_TTL_DAYS`     | Cookie/session lifetime in days (default `7`)                           |
| `WEB_ORIGIN`           | Exact browser origin allowed by CORS                                    |
| `COOKIE_SECURE`        | `true` / `false`; defaults from `NODE_ENV`                              |
| `TOKEN_ENCRYPTION_KEY` | Optional 32+ chars for encrypting Netlify tokens at rest (later phases) |

Docker Compose reads the repo-root `.env` for **`VITE_API_BASE`** and **`VITE_APP_TITLE`** when building the **web** image (see `.env.docker.example`). Change `VITE_API_BASE` before `docker compose build` if the API is exposed on a different public URL than `http://localhost:3000`.

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
2. **Phase 2:** Netlify API client module, per-account token vault (encryption), proxy configuration surface.
3. **Phase 3:** Sync jobs + BullMQ processors, cached read models in PostgreSQL, adaptive scheduling respecting Netlify rate limits.
4. **Phase 4:** Deploy / delete / monitoring flows, RBAC, audit log UI.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
