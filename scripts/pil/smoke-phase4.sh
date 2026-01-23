#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PIL_BASE_URL:-http://localhost:3220}"

scores=$(curl -fsS "${BASE_URL}/v1/validator-scores")
python3 - <<'PY'
import json,sys
payload=json.load(sys.stdin)
items=payload.get("validators") or []
if not items:
    raise SystemExit("No validator scores returned")
PY
<<<"$scores"

echo "Phase 4 smoke tests passed."
