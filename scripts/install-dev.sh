#!/usr/bin/env bash
#
# NetlifyHub developer install — Node/pnpm on host (local development).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/install-prerequisites.sh
source "${ROOT}/scripts/install-prerequisites.sh"

export NETLIFYHUB_INSTALL_ROOT="$ROOT"

_log_info "Developer install — Node.js, pnpm, Postgres/Redis..."
netlifyhub_install_prerequisites dev

pnpm install

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env at repo root — edit DATABASE_URL, REDIS_URL, WEB_ORIGIN, TOKEN_ENCRYPTION_KEY."
fi

_log_info "Ensuring PostgreSQL and Redis are available..."
netlifyhub_ensure_datastores
netlifyhub_verify_database_ready

if ! grep -qE '^DATABASE_URL=.+$' .env 2>/dev/null; then
  echo ""
  echo "ERROR: DATABASE_URL is missing or empty in .env"
  exit 1
fi

_sync_env_files
grep '^DATABASE_URL=' .env | head -1 | sed 's/^/[NetlifyHub] /'

echo ""
echo "Running database migrations..."
pnpm db:generate
pnpm db:migrate

echo "Create the first administrator (interactive):"
pnpm --filter @netlifyhub/api run create-admin

echo ""
echo "NetlifyHub dev environment is ready."
echo "  Start: pnpm dev"
echo "  API:   http://localhost:3000"
echo "  Web:   http://localhost:5173"
