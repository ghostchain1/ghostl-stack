#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

TOKEN="${CLOCK_SYNC_PROXY_TOKEN:-}"
BASE_URL="${CLOCK_SYNC_PROXY_URL:-http://localhost:7690}"

if [ -z "$TOKEN" ]; then
  echo "CLOCK_SYNC_PROXY_TOKEN is not set (check $ENV_FILE)." >&2
  exit 1
fi

payload='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d "$payload" \
  "${BASE_URL}/l1"
