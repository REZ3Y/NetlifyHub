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

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env at repo root — set DATABASE_URL, REDIS_URL, WEB_ORIGIN, TOKEN_ENCRYPTION_KEY."
fi

echo "Running database migrations (requires PostgreSQL and DATABASE_URL in .env)..."
pnpm --filter @netlifyhub/api exec prisma migrate deploy

echo "Create the first administrator (interactive):"
pnpm --filter @netlifyhub/api run create-admin

echo ""
echo "NetlifyHub is ready."
echo "  Start stack: pnpm dev"
echo "  API:         http://localhost:3000"
echo "  Web:         http://localhost:5173"
