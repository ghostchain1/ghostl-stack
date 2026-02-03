#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
VAULT_PATH="${VAULT_PATH:-secret/data/ghost/ai-clock-sync}"

if [ -z "$VAULT_ADDR" ] || [ -z "$VAULT_TOKEN" ]; then
  echo "Set VAULT_ADDR and VAULT_TOKEN before seeding Vault." >&2
  exit 1
fi

payload="$(python3 - <<'PY'
import json
import os

keys = [
    "CLOCK_SYNC_RPC_L1",
    "CLOCK_SYNC_RPC_L2",
    "CLOCK_SYNC_RPC_L3",
    "RPC_REGISTRY_URL",
    "REGISTRY_TIMEOUT_MS",
    "REGISTRY_RETRY_COUNT",
    "REGISTRY_CACHE_MS",
    "CLOCK_SYNC_INTERVAL_MS",
    "CLOCK_SYNC_DRIFT_THRESHOLD_SEC",
    "RPC_TIMEOUT_MS",
    "PROXY_TIMEOUT_MS",
    "CLOCK_SYNC_PROXY_TOKEN",
]

data = {key: os.environ.get(key) for key in keys if os.environ.get(key)}
print(json.dumps({"data": data}))
PY
)"

curl -fsS \
  -H "X-Vault-Token: $VAULT_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$VAULT_ADDR/v1/${VAULT_PATH}" \
  --data "$payload" >/dev/null

echo "Seeded ai-clock-sync secrets at $VAULT_PATH"
