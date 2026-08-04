#!/usr/bin/env bash
# Apply ui-app sample corpus to the local frappe_docker sandbox (OI-055 / S−1).
#
# Usage:
#   CONFIRM_SAMPLE_SEED=1 npm run seed:sample
#   CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset   # cancel+delete prior tagged docs first
#
# Env:
#   FRAPPE_SITE                default: frontend
#   FRAPPE_BACKEND_CONTAINER   default: frappe_docker-backend-1
#   SAMPLE_AS_OF               YYYY-MM-DD (default: today)
#   SAMPLE_COMPANY             optional override (must still look like SANDBOX unless FORCE)
#   SAMPLE_DATA_FORCE=1        emergency bypass (do not use on real books)
#   CONFIRM_SAMPLE_SEED=1      required

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE="${FRAPPE_SITE:-frontend}"
CONTAINER="${FRAPPE_BACKEND_CONTAINER:-frappe_docker-backend-1}"
RESET=0
for arg in "$@"; do
  if [[ "$arg" == "--reset" ]]; then RESET=1; fi
done

if [[ "${CONFIRM_SAMPLE_SEED:-}" != "1" && "${CONFIRM_SAMPLE_SEED:-}" != "true" && "${CONFIRM_SAMPLE_SEED:-}" != "yes" ]]; then
  echo "Refusing: set CONFIRM_SAMPLE_SEED=1 to write sample docs." >&2
  echo "Example: CONFIRM_SAMPLE_SEED=1 npm run seed:sample" >&2
  exit 2
fi

if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "Container $CONTAINER not found. Is frappe_docker up on :8080?" >&2
  exit 1
fi

PLAN_HOST="$(mktemp /tmp/corpus-plan.XXXXXX.json)"
cleanup() { rm -f "$PLAN_HOST"; }
trap cleanup EXIT

echo "Emitting corpus plan…"
SAMPLE_AS_OF="${SAMPLE_AS_OF:-}" node "$ROOT/ops/sample-data/emit-plan.js" >"$PLAN_HOST"

# Preflight: company must look like sandbox (mirrors src/sample-data/sandbox-guard.js)
COMPANY="$(docker exec "$CONTAINER" bash -lc "cd /home/frappe/frappe-bench && bench --site '$SITE' execute frappe.db.get_single_value --args '[\"Global Defaults\", \"default_company\"]'" | tr -d '\r' | tail -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d \"\' )"
# Fallback list if single value empty
if [[ -z "$COMPANY" || "$COMPANY" == "None" || "$COMPANY" == "null" ]]; then
  COMPANY="$(docker exec "$CONTAINER" bash -lc "cd /home/frappe/frappe-bench && bench --site '$SITE' execute frappe.get_all --kwargs '{\"doctype\":\"Company\",\"pluck\":\"name\",\"limit\":1}'" | tr -d '\r[]\" ' | head -n1)"
fi
echo "Site=$SITE Company=$COMPANY Container=$CONTAINER"

if [[ "${SAMPLE_DATA_FORCE:-}" != "1" ]]; then
  if [[ "$SITE" != "frontend" && "$SITE" != *sandbox* && "$SITE" != *SANDBOX* ]]; then
    echo "Refusing: site '$SITE' is not an allowlisted sandbox." >&2
    exit 3
  fi
  if ! grep -qi 'sandbox' <<<"$COMPANY"; then
    echo "Refusing: company '$COMPANY' does not look like a sandbox." >&2
    exit 3
  fi
fi

echo "Copying plan + seed into container…"
docker cp "$PLAN_HOST" "$CONTAINER:/tmp/corpus-plan.json"
docker cp "$ROOT/ops/sample-data/seed_corpus.py" "$CONTAINER:/tmp/seed_corpus.py"

echo "Running seed (reset=$RESET)…"
# bench execute accepts a dotted method OR one Python expression (eval).
docker exec \
  -e SAMPLE_COMPANY="${SAMPLE_COMPANY:-}" \
  -e SAMPLE_DATA_FORCE="${SAMPLE_DATA_FORCE:-}" \
  "$CONTAINER" bash -lc "
set -e
cd /home/frappe/frappe-bench
bench --site '$SITE' execute \"[exec(open('/tmp/seed_corpus.py').read(), g:={}), g['run'](plan_path='/tmp/corpus-plan.json', reset=$RESET)][1]\"
"

echo "Done. Dogfood: npm start → Find / source pickers / create-from-source flows."
