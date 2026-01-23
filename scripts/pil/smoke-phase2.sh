#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PIL_BASE_URL:-http://localhost:3220}"

simulations=$(curl -fsS "${BASE_URL}/v1/simulations")
first_id=$(python3 - <<'PY'
import json,sys
payload=json.load(sys.stdin)
items=payload.get("simulations") or []
if not items:
    print("")
    sys.exit(0)
print(items[0].get("id",""))
PY
<<<"$simulations")

if [[ -z "$first_id" ]]; then
  echo "No simulations returned from ${BASE_URL}/v1/simulations" >&2
  exit 1
fi

results=$(curl -fsS "${BASE_URL}/v1/simulations/${first_id}/results")
python3 - <<'PY'
import json,sys
payload=json.load(sys.stdin)
items=payload.get("results") or []
if not items:
    raise SystemExit("No simulation results returned")
PY
<<<"$results"

echo "Phase 2 smoke tests passed."
