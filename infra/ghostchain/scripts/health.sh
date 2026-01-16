#!/usr/bin/env bash
set -euo pipefail

RPC="${RPC:-http://localhost:18545}"

rpc() {
  local method="$1"
  curl -s -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" \
    "$RPC"
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
CHAIN_ID_RESP=$(rpc eth_chainId)
BLOCK_RESP=$(rpc eth_blockNumber)
PEERS_RESP=$(rpc net_peerCount)

parse_hex eth_chainId "$CHAIN_ID_RESP"
parse_hex eth_blockNumber "$BLOCK_RESP"
parse_hex net_peerCount "$PEERS_RESP"
