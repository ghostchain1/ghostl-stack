#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/ghostl-stack"

echo "Running chain checks..."
bash "$ROOT_DIR/infra/scripts/chains/doctor.sh"

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
echo "  L1(anvil):  $(jsonrpc_chain_id http://localhost:8545 || true)"
echo "  L2:         $(jsonrpc_chain_id http://localhost:9545 || true)"
echo "  L3:         $(jsonrpc_chain_id http://localhost:10545 || true)"

echo
echo "Health endpoints:"

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
