#!/usr/bin/env bash
set -Eeuo pipefail

# Ghost-native chain bootstrap helper.
# Starts GhostChain L1 and the custom GhostL2 / GhostL3 execution services.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# shellcheck source=scripts/testnet/common.sh
source "$ROOT_DIR/scripts/testnet/common.sh"

l1_services=(
  ghostchain-bootnode
  ghostchain-node1
  ghostchain-node2
  ghostchain-rpc-proxy
)

l2_services=(
  ghost-exec-l2
  ghost-sequencer-l2
  ghost-deriver-l2
  ghost-settlement-l2
  ghost-bridge-l2
  ghost-proof-l2
)

l3_services=(
  ghost-exec-l3
  ghost-sequencer-l3
  ghost-deriver-l3
  ghost-settlement-l3
  ghost-bridge-l3
  ghost-proof-l3
)

usage() {
  cat <<EOF >&2
Usage: bash infra/scripts/chains/init.sh [all|l2|l3]
  all (default): start GhostChain L1, GhostL2, and GhostL3
  l2:            start GhostChain L1 and GhostL2 only
  l3:            start GhostChain L1, GhostL2, then GhostL3
EOF
}

start_l1() {
  if [[ "${START_L1_STACK:-1}" == "1" ]]; then
    compose_cmd up -d --build "${l1_services[@]}"
    wait_for_rpc "GhostChain L1" "$RPC_L1" 45 2
  else
    wait_for_rpc "GhostChain L1 prerequisite" "$RPC_L1" 10 2
  fi
}

start_l2() {
  start_l1
  compose_cmd up -d --build "${l2_services[@]}"
  wait_for_http "ghost-exec-l2" "http://localhost:7260/status" 30 2
  wait_for_http "ghost-settlement-l2" "http://localhost:7263/status" 30 2
}

start_l3() {
  start_l2
  compose_cmd up -d --build "${l3_services[@]}"
  wait_for_http "ghost-exec-l3" "http://localhost:7270/status" 30 2
  wait_for_http "ghost-settlement-l3" "http://localhost:7273/status" 30 2

  if [[ "${INCLUDE_OBSERVABILITY:-0}" == "1" ]]; then
    compose_cmd up -d --build ghost-observability
    wait_for_http "ghost-observability" "http://localhost:7276/readyz" 30 2
  fi
}

target="${1:-all}"

bash "$ROOT_DIR/infra/scripts/env-sync-stack.sh"

case "$target" in
  all)
    start_l3
    ;;
  l2)
    start_l2
    ;;
  l3)
    start_l3
    ;;
  *)
    usage
    exit 1
    ;;
esac

echo "[chains/init] PASS"
