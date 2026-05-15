#!/usr/bin/env bash
#
# NetlifyHub production installer — Docker Compose (recommended for servers).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/install-prerequisites.sh
source "${ROOT}/scripts/install-prerequisites.sh"
# shellcheck source=scripts/install-env-prompt.sh
source "${ROOT}/scripts/install-env-prompt.sh"

export NETLIFYHUB_INSTALL_ROOT="$ROOT"

_log_info "Docker install — checking prerequisites..."
netlifyhub_install_prerequisites docker

netlifyhub_prompt_env

if [[ ! -f ".env" ]]; then
  _log_err "Missing .env after setup prompts."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

web_origin="${WEB_ORIGIN:-http://localhost:3000}"
panel_port="${NETLIFYHUB_PORT:-3000}"
if [[ "$web_origin" =~ :([0-9]+)$ ]]; then
  panel_port="${BASH_REMATCH[1]}"
fi

_log_info "Building and starting containers (this may take several minutes)..."
netlifyhub_docker_compose up -d --build

_log_info "Waiting for API health on port ${panel_port}..."
ready=0
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${panel_port}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "$ready" -ne 1 ]]; then
  _log_err "API did not become healthy in time."
  _log_err "Check: netlifyhub_docker_compose logs api"
  netlifyhub_docker_compose ps || true
  exit 1
fi

echo ""
echo "============================================"
echo " NetlifyHub is running (Docker)"
echo "============================================"
echo "  Panel:  ${web_origin}"
echo "  Login:  ${SEED_ADMIN_USERNAME:-admin} (password you entered)"
echo ""
echo "  Commands (from ${ROOT}):"
echo "    netlifyhub_docker_compose ps"
echo "    netlifyhub_docker_compose logs -f api"
echo "    netlifyhub_docker_compose down"
echo "  If login fails after upgrade, sync admin from .env:"
echo "    netlifyhub_docker_compose exec api pnpm --filter @netlifyhub/api run reset-admin-from-env"
echo "============================================"
