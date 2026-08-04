#!/usr/bin/env bash
# ensure-erp-up.sh — bring frappe_docker ERPNext up and verify /api/method/ping.
#
# Optional ops script for ERP *hosts* (this PC runs Docker). Not wired into the
# Electron app by default — IT may point autofix at an absolute copy/path.
#
# Does NOT launch any UI shell (museum or erpnext-ui-app). Start the app yourself:
#   cd ~/erpnext-ui-app && npm start
#
# Why: after host/Docker reboot, nginx (frontend) and websocket often start before
# Docker DNS can resolve siblings → crash loop, nothing on :8080. Fix = up, wait
# for DB, restart racy services once upstreams exist, wait for ping 200.
#
# Env overrides:
#   FRAPPE_DOCKER   default /home/pi/erpnext/frappe_docker
#   COMPOSE_FILE    default pwd-custom.yml (relative to FRAPPE_DOCKER)
#   ERP_PING_URL    default http://localhost:8080/api/method/ping
#
set -uo pipefail

FD="${FRAPPE_DOCKER:-/home/pi/erpnext/frappe_docker}"
COMPOSE_FILE="${COMPOSE_FILE:-pwd-custom.yml}"
CF=(-f "$COMPOSE_FILE")
PING="${ERP_PING_URL:-http://localhost:8080/api/method/ping}"
EXPECTED="db redis-cache redis-queue backend websocket queue-short queue-long scheduler frontend"

cd "$FD" || { echo "✗ FRAPPE_DOCKER not found: $FD" >&2; exit 1; }

ping_code() { curl -s -o /dev/null -w '%{http_code}' "$PING" 2>/dev/null; }

echo "▶ Bringing the ERPNext stack up ($FD, $COMPOSE_FILE)..."
docker compose "${CF[@]}" start 2>/dev/null || docker compose "${CF[@]}" up -d

echo "▶ Waiting for the database to be healthy..."
for _ in $(seq 1 90); do
  docker compose "${CF[@]}" ps db --format "{{.Status}}" 2>/dev/null | grep -q "(healthy)" && break
  sleep 2
done

if [ "$(ping_code)" != "200" ]; then
  echo "▶ Re-syncing nginx + realtime (upstream DNS resolution)..."
  docker compose "${CF[@]}" restart frontend websocket >/dev/null 2>&1
  sleep 4
fi

echo "▶ Checking expected services..."
MISSING=""
for s in $EXPECTED; do
  st="$(docker compose "${CF[@]}" ps "$s" --format '{{.State}}' 2>/dev/null)"
  if [ "$st" = "running" ]; then
    echo "  ✓ $s"
  else
    echo "  ✗ $s ($st)"
    MISSING="$MISSING $s"
  fi
done

echo "▶ Checking the web is serving..."
CODE=""
for _ in $(seq 1 30); do
  CODE="$(ping_code)"
  [ "$CODE" = "200" ] && break
  sleep 2
done
echo "  ping: $CODE"

if [ "$CODE" != "200" ] || [ -n "$MISSING" ]; then
  echo ""
  echo "⚠ Not all green (missing:${MISSING:- none}, ping:$CODE). Recent logs:"
  for s in frontend websocket $MISSING; do
    echo "--- $s ---"
    docker compose "${CF[@]}" logs "$s" --tail 6 2>&1 | tail -6
  done
  echo ""
  echo "If it's an 'upstream not found' loop, deps may be up now — run this script again."
  exit 1
fi

echo "✅ ERPNext is up and serving ($PING)."
echo "   UI (optional): cd ~/erpnext-ui-app && npm start"
exit 0
