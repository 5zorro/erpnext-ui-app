#!/usr/bin/env bash
# upgrade-sandbox.sh — version check + in-place upgrade for the local frappe_docker sandbox.
#
# Keeps the sites volume (sample / sandbox company data). Rebuilds qb-erpnext:latest from version-16,
# recreates containers, runs bench migrate, clear-cache, then ensure-erp-up.
#
# Usage:
#   bash ops/erp-host/upgrade-sandbox.sh              # check only (local vs GitHub)
#   bash ops/erp-host/upgrade-sandbox.sh --check
#   CONFIRM_SANDBOX_UPGRADE=1 bash ops/erp-host/upgrade-sandbox.sh --upgrade
#   CONFIRM_SANDBOX_UPGRADE=1 bash ops/erp-host/upgrade-sandbox.sh --upgrade --skip-build
#
# Env:
#   FRAPPE_DOCKER     default /home/pi/erpnext/frappe_docker
#   COMPOSE_FILE      default pwd-custom.yml
#   SITE              default frontend
#   BUILD_IMAGE_SH    default ~/agent-harness/erpnext/custom-image/build-image.sh
#   ENSURE_ERP_UP     default this repo's ops/erp-host/ensure-erp-up.sh
#   ERP_PING_URL      default http://localhost:8080/api/method/ping
#
# Does NOT wipe volumes (no docker compose down -v). For a clean recreate see
# ~/agent-harness/erpnext/custom-image/DEPLOY.md
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FD="${FRAPPE_DOCKER:-/home/pi/erpnext/frappe_docker}"
COMPOSE_FILE="${COMPOSE_FILE:-pwd-custom.yml}"
CF=(-f "$COMPOSE_FILE")
SITE="${SITE:-frontend}"
BUILD_IMAGE_SH="${BUILD_IMAGE_SH:-/home/pi/agent-harness/erpnext/custom-image/build-image.sh}"
ENSURE="${ENSURE_ERP_UP:-$HERE/ensure-erp-up.sh}"
PING="${ERP_PING_URL:-http://localhost:8080/api/method/ping}"
BACKEND="${FRAPPE_BACKEND_CONTAINER:-frappe_docker-backend-1}"

MODE="check"
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --upgrade) MODE="upgrade" ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

cd "$FD" || { echo "✗ FRAPPE_DOCKER not found: $FD" >&2; exit 1; }

github_latest_tag() {
  local repo="$1"
  curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" \
    | grep -m1 '"tag_name"' \
    | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
}

local_versions() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$BACKEND"; then
    echo "(backend container $BACKEND not running)"
    return 1
  fi
  docker exec "$BACKEND" bash -lc \
    'cd /home/frappe/frappe-bench && bench version 2>/dev/null' \
    | tr -d '\r'
}

image_versions() {
  docker run --rm --entrypoint bash qb-erpnext:latest -lc \
    'cd /home/frappe/frappe-bench && for a in frappe erpnext hrms; do
       f=apps/$a/$a/__init__.py
       v=$(grep -m1 __version__ "$f" 2>/dev/null | sed "s/.*= *\"\([^\"]*\)\".*/\1/")
       echo "$a ${v:-?}"
     done' 2>/dev/null || echo "(qb-erpnext:latest missing or unreadable)"
}

echo "▶ Sandbox paths"
echo "  FRAPPE_DOCKER=$FD"
echo "  COMPOSE_FILE=$COMPOSE_FILE"
echo "  SITE=$SITE"
echo ""

echo "▶ Local running versions (bench)"
if LOCAL="$(local_versions)"; then
  echo "$LOCAL" | sed 's/^/  /'
else
  echo "  (stack down — start with ensure-erp-up.sh first for a live check)"
  LOCAL=""
fi
echo ""

echo "▶ Image qb-erpnext:latest (baked apps)"
image_versions | sed 's/^/  /'
echo ""

echo "▶ Latest GitHub releases"
ERP_TAG="$(github_latest_tag frappe/erpnext || true)"
FRAPPE_TAG="$(github_latest_tag frappe/frappe || true)"
HRMS_TAG="$(github_latest_tag frappe/hrms || true)"
echo "  erpnext  ${ERP_TAG:-?}"
echo "  frappe   ${FRAPPE_TAG:-?}"
echo "  hrms     ${HRMS_TAG:-?}"
echo ""

local_erp="$(echo "$LOCAL" | awk '/^erpnext /{print $2; exit}')"
want_erp="${ERP_TAG#v}"
if [ -n "$local_erp" ] && [ -n "$want_erp" ] && [ "$local_erp" = "$want_erp" ]; then
  echo "✅ Running ERPNext $local_erp matches latest release tag $ERP_TAG"
else
  echo "ℹ Running ERPNext ${local_erp:-unknown} vs latest $ERP_TAG"
  echo "  (Frappe/HRMS tags often lag ERPNext point releases — version-16 build is fine.)"
fi

if [ "$MODE" = "check" ]; then
  echo ""
  echo "Check only. To upgrade in place (keep DB):"
  echo "  CONFIRM_SANDBOX_UPGRADE=1 $0 --upgrade"
  exit 0
fi

if [ "${CONFIRM_SANDBOX_UPGRADE:-}" != "1" ]; then
  echo "" >&2
  echo "Refusing upgrade without CONFIRM_SANDBOX_UPGRADE=1" >&2
  echo "  (in-place migrate keeps the sites volume; still restart/migrate the sandbox.)" >&2
  exit 1
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  if [ ! -x "$BUILD_IMAGE_SH" ] && [ ! -f "$BUILD_IMAGE_SH" ]; then
    echo "✗ build script missing: $BUILD_IMAGE_SH" >&2
    exit 1
  fi
  echo ""
  echo "▶ Building qb-erpnext:latest (version-16 apps — ~15–30 min)..."
  bash "$BUILD_IMAGE_SH" "$FD"
else
  echo "▶ Skipping image build (--skip-build)"
fi

echo ""
echo "▶ Recreating containers (volumes kept)..."
docker compose "${CF[@]}" up -d --force-recreate

echo "▶ Waiting for database healthy..."
for _ in $(seq 1 90); do
  docker compose "${CF[@]}" ps db --format "{{.Status}}" 2>/dev/null | grep -q "(healthy)" && break
  sleep 2
done
st="$(docker compose "${CF[@]}" ps db --format '{{.Status}}' 2>/dev/null || true)"
echo "  db: $st"
echo "$st" | grep -q "(healthy)" || {
  echo "✗ database not healthy" >&2
  exit 1
}

echo "▶ Waiting for backend..."
for _ in $(seq 1 60); do
  docker exec "$BACKEND" bench --version >/dev/null 2>&1 && break
  sleep 3
done

echo "▶ Migrating site $SITE..."
docker compose "${CF[@]}" exec -T backend bench --site "$SITE" migrate

echo "▶ Clearing cache..."
docker compose "${CF[@]}" exec -T backend bench --site "$SITE" clear-cache

echo "▶ Restarting frontend + websocket..."
docker compose "${CF[@]}" restart frontend websocket >/dev/null

echo "▶ ensure-erp-up..."
bash "$ENSURE"

echo ""
echo "✅ Sandbox upgrade finished. Versions now:"
local_versions | sed 's/^/  /' || true
echo "  ping: $(curl -s -o /dev/null -w '%{http_code}' "$PING" 2>/dev/null)"
echo "  UI: cd ~/erpnext-ui-app && npm start"
