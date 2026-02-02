#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CANONICAL="$ROOT_DIR/ops/STACK_CANONICAL.yml"

rpc_call() {
  local url="$1"
  local method="$2"
  local payload
  payload=$(printf '{"jsonrpc":"2.0","id":1,"method":"%s","params":[]}' "$method")
  curl -sS --max-time 5 -H 'Content-Type: application/json' -d "$payload" "$url" || return 1
}

get_chain_url() {
  local key="$1"
  python3 - "$CANONICAL" "$key" <<'PY'
import json,sys,os
path=sys.argv[1]
key=sys.argv[2]
if not os.path.isfile(path):
    print("")
    raise SystemExit(0)
data=json.load(open(path))
chain=data.get("chains",{}).get(key,{})
print(chain.get("rpcHttp","") or "")
PY
}

L1_URL=$(get_chain_url l1)
L2_URL=$(get_chain_url l2)
L3_URL=$(get_chain_url l3)

echo "Smoke check: chain RPCs"
for pair in "l1:$L1_URL" "l2:$L2_URL" "l3:$L3_URL"; do
  key="${pair%%:*}"
  url="${pair#*:}"
  if [[ -z "$url" ]]; then
    echo "$key: rpc url missing"
    exit 1
  fi
  if ! rpc_call "$url" eth_chainId >/dev/null; then
    echo "$key: eth_chainId failed"
    exit 1
  fi
  if ! rpc_call "$url" eth_blockNumber >/dev/null; then
    echo "$key: eth_blockNumber failed"
    exit 1
  fi
done

echo "Smoke check: UI status endpoint"
if ! curl -sS --max-time 5 "http://localhost:3200/api/status" >/dev/null; then
  echo "UI status endpoint failed"
  exit 1
fi

echo "Smoke check: API status"
if ! curl -sS --max-time 5 "http://localhost:4000/health" >/dev/null; then
  echo "API health failed"
  exit 1
fi

echo "Smoke check: OK"
