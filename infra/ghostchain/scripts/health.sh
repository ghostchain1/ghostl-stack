#!/usr/bin/env bash
set -euo pipefail

RPC="${RPC:-http://localhost:18545}"

rpc() {
  local method="$1"
  curl -s -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" \
    "$RPC"
}

rpc_first_available() {
  local preferred="$1"
  local fallback="$2"
  local response

  response="$(rpc "$preferred")"
  if printf '%s' "$response" | grep -q '"result"'; then
    printf '%s\n' "$preferred"
    printf '%s' "$response"
    return 0
  fi

  printf '%s\n' "$fallback"
  rpc "$fallback"
}

parse_hex() {
  python3 - <<'PY' "$1" "$2"
import json, sys
method, raw = sys.argv[1], sys.argv[2]
try:
    data = json.loads(raw)
    result = data.get("result")
    if isinstance(result, str) and result.startswith("0x"):
        print(f"{method}: {int(result,16)} (hex {result})")
    else:
        print(f"{method}: {result}")
except Exception as e:
    print(f"{method}: error parsing response: {e}")
PY
}

echo "[health] RPC: $RPC"
readarray -t CHAIN_ID_DATA < <(rpc_first_available ghost_chainId eth_chainId)
CHAIN_ID_METHOD="${CHAIN_ID_DATA[0]}"
CHAIN_ID_RESP="${CHAIN_ID_DATA[1]:-}"
readarray -t BLOCK_DATA < <(rpc_first_available ghost_blockNumber eth_blockNumber)
BLOCK_METHOD="${BLOCK_DATA[0]}"
BLOCK_RESP="${BLOCK_DATA[1]:-}"
PEERS_RESP=$(rpc net_peerCount)

parse_hex "$CHAIN_ID_METHOD" "$CHAIN_ID_RESP"
parse_hex "$BLOCK_METHOD" "$BLOCK_RESP"
parse_hex net_peerCount "$PEERS_RESP"
