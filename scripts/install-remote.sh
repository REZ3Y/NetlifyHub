#!/usr/bin/env bash
#
# Legacy remote entrypoint — prefer the repository root install.sh:
#   bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
#
# This script fetches that file so old links and docs keep working.
#
set -euo pipefail

echo "NetlifyHub: use root installer — bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)" >&2
exec bash <(curl -fsSL https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
