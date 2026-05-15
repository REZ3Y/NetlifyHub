#!/usr/bin/env bash
#
# NetlifyHub installer router.
# Default: Docker (servers). Use NETLIFYHUB_INSTALL_MODE=dev for local development.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${NETLIFYHUB_INSTALL_MODE:-docker}"

case "$MODE" in
  docker)
    exec bash "${ROOT}/scripts/install-docker.sh"
    ;;
  dev | native)
    exec bash "${ROOT}/scripts/install-dev.sh"
    ;;
  *)
    echo "Unknown NETLIFYHUB_INSTALL_MODE=${MODE} (use: docker | dev)" >&2
    exit 1
    ;;
esac
