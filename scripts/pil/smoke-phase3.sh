#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PIL_BASE_URL:-http://localhost:3220}"

payload=$(cat <<'JSON'
{
  "action": "TRANSFER",
  "subjectHash": "0x4a1f3c2e6b1d74ac9e6b1b4d3a7e0a4f6c5b9d2c6a1e4f7b9c0d2e3f4a5b6c7d",
  "jurisdictionHints": ["US"],
  "context": {"amountUSD": 1500}
}
JSON
)

response=$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "${BASE_URL}/v1/preflight/evaluate")

python3 - <<'PY'
import json,sys
payload=json.load(sys.stdin)
if "decision" not in payload:
    raise SystemExit("Missing decision in preflight response")
if payload["decision"] not in ("ALLOW","WARN","BLOCK"):
    raise SystemExit(f"Unexpected decision: {payload['decision']}")
PY
<<<"$response"

echo "Phase 3 smoke tests passed."
