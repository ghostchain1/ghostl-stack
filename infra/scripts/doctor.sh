#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
OP_ENV="$ROOT_DIR/infra/opstack/.env"

if [ -f "$OP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_ENV"
  [ -f "$ROOT_DIR/infra/opstack/.env.secrets" ] && source "$ROOT_DIR/infra/opstack/.env.secrets"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:28545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_GATE_RPC="${HOST_GATE_RPC:-http://localhost:28546}"

jsonrpc_chain_id() {
  local url="$1"
  curl -sS -X POST "$url" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
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

print_http() {
  local url="$1"
  curl -sS --max-time 3 "$url" || true
  echo
}

echo
echo "RPC chainIds:"
echo "  L1(anvil):  $(jsonrpc_chain_id "$HOST_L1_RPC" || true)"
echo "  L2(op-geth):$(jsonrpc_chain_id "$HOST_L2_RPC" || true)"
echo "  L3(op-stack optional): $(jsonrpc_chain_id "$HOST_L3_RPC" || true)"

echo
echo "Health endpoints:"

wait_http "$HOST_GATE_RPC/gate/status" op-gate >/dev/null || true
print_http "$HOST_GATE_RPC/gate/status"

wait_http http://localhost:9546 optimism-op-node >/dev/null || true
print_http http://localhost:9546

wait_http http://localhost:7070/health ghost-guard >/dev/null || true
print_http http://localhost:7070/health

wait_http http://localhost:7171/health ghost-relayer >/dev/null || true
print_http http://localhost:7171/health

wait_http http://localhost:7272/health rollup-proposer-l2 >/dev/null || true
print_http http://localhost:7272/health

wait_http http://localhost:7373/health rollup-proposer-l3 >/dev/null || true
print_http http://localhost:7373/health

wait_http http://localhost:7282/health rollup-challenger-l2 >/dev/null || true
print_http http://localhost:7282/health

wait_http http://localhost:7383/health rollup-challenger-l3 >/dev/null || true
print_http http://localhost:7383/health

wait_http http://localhost:9090/-/ready prometheus >/dev/null || true
print_http http://localhost:9090/-/ready

wait_http http://localhost:3000/api/health grafana >/dev/null || true
print_http http://localhost:3000/api/health

echo "OK"
