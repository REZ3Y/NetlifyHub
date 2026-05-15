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

# Remote one-line install: bootstrap tools, clone, then run repo installer.
bootstrap_dir="$(mktemp -d)"
trap 'rm -rf "${bootstrap_dir}"' EXIT

_repo_raw_base() {
  local repo="${NETLIFYHUB_REPO_URL:-https://github.com/REZ3Y/NetlifyHub.git}"
  local branch="${NETLIFYHUB_REPO_BRANCH:-main}"
  repo="${repo%.git}"
  repo="${repo#https://github.com/}"
  repo="${repo#http://github.com/}"
  echo "https://raw.githubusercontent.com/${repo}/${branch}"
}

curl -fsSL "$(_repo_raw_base)/scripts/install-prerequisites.sh" \
  -o "${bootstrap_dir}/install-prerequisites.sh"

# shellcheck source=/dev/null
source "${bootstrap_dir}/install-prerequisites.sh"
netlifyhub_install_prerequisites bootstrap

DEFAULT_REPO="${NETLIFYHUB_REPO_URL:-https://github.com/REZ3Y/NetlifyHub.git}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}" "${bootstrap_dir}"' EXIT

echo "Cloning NetlifyHub from ${DEFAULT_REPO} ..."
git clone --depth 1 "${DEFAULT_REPO}" "${TMP}/netlifyhub"
cd "${TMP}/netlifyhub"
bash scripts/install.sh
