#!/usr/bin/env bash
set -euo pipefail

# Lightweight OP Stack chain doctor for GhostL2 + optional GhostL3 overlay.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OP_ENV="$ROOT_DIR/infra/opstack/.env"

if [ -f "$OP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_ENV"
  [ -f "$ROOT_DIR/infra/opstack/.env.secrets" ] && source "$ROOT_DIR/infra/opstack/.env.secrets"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_GATE_RPC="${HOST_GATE_RPC:-http://localhost:28546}"

jsonrpc_chain_id() {
  local url="$1"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | jq -r '.result' 2>/dev/null
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-20}"
  local sleep_s="${4:-1}"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "OK: $label ($url)"
      return 0
    fi
    sleep "$sleep_s"
  done
  echo "NOT READY: $label ($url)"
  return 1
}

echo "OP Stack chain doctor"
echo "  L1 RPC: $HOST_L1_RPC"
echo "  L2 RPC: $HOST_L2_RPC"
echo "  L3 RPC: $HOST_L3_RPC"
echo "  Gate:   $HOST_GATE_RPC"

echo
echo "Chain IDs:"
echo "  L1: $(jsonrpc_chain_id "$HOST_L1_RPC" || echo 'unreachable')"
echo "  L2: $(jsonrpc_chain_id "$HOST_L2_RPC" || echo 'unreachable')"
echo "  L3: $(jsonrpc_chain_id "$HOST_L3_RPC" || echo 'unreachable (optional)')"

echo
echo "Health endpoints:"
wait_http "$HOST_GATE_RPC/gate/status" op-gate >/dev/null || true
wait_http "$HOST_L2_RPC" l2-geth-jsonrpc >/dev/null || true
wait_http "http://localhost:9546" op-node-rpc >/dev/null || true
wait_http "http://localhost:8551" op-batcher-rpc >/dev/null || true
wait_http "http://localhost:8560" op-proposer-rpc >/dev/null || true

if curl -fsS "$HOST_L3_RPC" >/dev/null 2>&1; then
  wait_http "$HOST_L3_RPC" l3-geth-jsonrpc >/dev/null || true
fi

echo "Done."
