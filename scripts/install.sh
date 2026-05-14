#!/usr/bin/env bash
#
# NetlifyHub local installer (manual / from cloned repo).
# Usage: bash scripts/install.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install with: corepack enable && corepack prepare pnpm@9.14.2 --activate"
  exit 1
fi

pnpm install

if [[ ! -f "apps/api/.env" ]]; then
  cp apps/api/.env.example apps/api/.env
  echo "Created apps/api/.env — set DATABASE_URL, REDIS_URL, WEB_ORIGIN before production."
fi

if [[ ! -f "apps/worker/.env" ]]; then
  cp apps/worker/.env.example apps/worker/.env
fi

if [[ ! -f "apps/web/.env" ]]; then
  cp apps/web/.env.example apps/web/.env
fi

echo "Running database migrations (requires PostgreSQL and DATABASE_URL in apps/api/.env)..."
pnpm --filter @netlifyhub/api exec prisma migrate deploy

echo "Create the first administrator (interactive):"
pnpm --filter @netlifyhub/api run create-admin

echo ""
echo "NetlifyHub is ready."
echo "  Start stack: pnpm dev"
echo "  API:         http://localhost:3000"
echo "  Web:         http://localhost:5173"
