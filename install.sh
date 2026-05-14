#!/usr/bin/env bash
#
# NetlifyHub installer (local clone or one-line remote).
#
# One-line (recommended; -f stops on 404 so bash never runs an error page):
#   bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
#
# Fork / mirror:
#   NETLIFYHUB_REPO_URL=https://github.com/you/NetlifyHub.git bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
#
set -euo pipefail

this_script="${BASH_SOURCE[0]:-$0}"
script_dir="$(cd "$(dirname "${this_script}")" && pwd)"

if [[ -f "${script_dir}/scripts/install.sh" ]] && [[ -f "${script_dir}/pnpm-workspace.yaml" ]]; then
  exec bash "${script_dir}/scripts/install.sh"
fi

DEFAULT_REPO="${NETLIFYHUB_REPO_URL:-https://github.com/REZ3Y/NetlifyHub.git}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "Cloning NetlifyHub from ${DEFAULT_REPO} ..."
git clone --depth 1 "${DEFAULT_REPO}" "${TMP}/netlifyhub"
cd "${TMP}/netlifyhub"
bash scripts/install.sh
