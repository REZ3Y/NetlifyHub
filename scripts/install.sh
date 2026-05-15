#!/usr/bin/env bash
#
# NetlifyHub local installer (manual / from cloned repo).
# Usage: bash scripts/install.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/install-prerequisites.sh
source "${ROOT}/scripts/install-prerequisites.sh"

export NETLIFYHUB_INSTALL_ROOT="$ROOT"
netlifyhub_install_prerequisites full

pnpm install

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env at repo root — edit DATABASE_URL, REDIS_URL, WEB_ORIGIN, TOKEN_ENCRYPTION_KEY."
fi

echo ""
echo "Running database migrations..."
pnpm db:generate
pnpm db:migrate

echo "Create the first administrator (interactive):"
pnpm --filter @netlifyhub/api run create-admin

echo ""
echo "NetlifyHub is ready."
echo "  Start stack: pnpm dev"
echo "  API:         http://localhost:3000"
echo "  Web:         http://localhost:5173"
