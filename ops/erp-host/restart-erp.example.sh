#!/usr/bin/env bash
# EXAMPLE ONLY — copy to a path IT chooses, then point Connection details → Autofix
# at that absolute path. Not wired into the app by default (security).
#
#   cp ops/erp-host/restart-erp.example.sh ~/bin/restart-erp.sh
#   # edit if needed, then Autofix → pick the copy
#
# This wrapper only brings ERP up; it does not open Electron.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# When copied out of the repo, set ENSURE to the ensure-erp-up.sh absolute path.
ENSURE="${ENSURE_ERP_UP:-$ROOT/ensure-erp-up.sh}"
exec bash "$ENSURE"
