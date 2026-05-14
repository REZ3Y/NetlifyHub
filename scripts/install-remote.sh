#!/usr/bin/env bash
#
# One-line installer entrypoint (intended to be piped from GitHub raw URL).
# Example:
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install-remote.sh | bash
#
# Override clone URL:
#   NETLIFYHUB_REPO_URL=https://github.com/you/netlifyhub.git curl -fsSL ... | bash
#
set -euo pipefail

DEFAULT_REPO="${NETLIFYHUB_REPO_URL:-https://github.com/your-org/netlifyhub.git}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "Cloning NetlifyHub from ${DEFAULT_REPO} ..."
git clone --depth 1 "${DEFAULT_REPO}" "${TMP}/netlifyhub"
cd "${TMP}/netlifyhub"
bash scripts/install.sh
