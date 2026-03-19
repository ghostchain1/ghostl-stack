#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

l1_services=(
  ghostchain-bootnode
  ghostchain-node1
  ghostchain-node2
  ghostchain-rpc-proxy
)

rollup_services=(
  ghost-exec-l2
  ghost-sequencer-l2
  ghost-deriver-l2
  ghost-settlement-l2
  ghost-bridge-l2
  ghost-proof-l2
  ghost-exec-l3
  ghost-sequencer-l3
  ghost-deriver-l3
  ghost-settlement-l3
  ghost-bridge-l3
  ghost-proof-l3
)

if [[ "${INCLUDE_OBSERVABILITY:-1}" == "1" ]]; then
  rollup_services+=(ghost-observability)
fi

if [[ -n "${EXTRA_UP_SERVICES:-}" ]]; then
  while IFS= read -r svc; do
    [[ -n "$svc" ]] && rollup_services+=("$svc")
  done < <(printf '%s' "$EXTRA_UP_SERVICES" | tr ',' '\n')
fi

if [[ "${INCLUDE_L1_STACK:-0}" == "1" ]]; then
  compose_cmd up -d --build "${l1_services[@]}"
  wait_for_rpc "GhostChain L1" "$RPC_L1" 45 2
else
  wait_for_rpc "GhostChain L1 prerequisite" "$RPC_L1" 10 2
fi

if [[ "${SKIP_BASE_RPC_CHECKS:-0}" != "1" ]]; then
  wait_for_rpc "GhostL2 base RPC prerequisite" "$RPC_L2" 10 2
  wait_for_rpc "GhostL3 base RPC prerequisite" "$RPC_L3" 10 2
fi

compose_cmd up -d --build "${rollup_services[@]}"

wait_for_http "ghost-exec-l2" "http://localhost:7260/status" 30 2
wait_for_http "ghost-settlement-l2" "http://localhost:7263/status" 30 2
wait_for_http "ghost-exec-l3" "http://localhost:7270/status" 30 2
wait_for_http "ghost-settlement-l3" "http://localhost:7273/status" 30 2

if [[ "${INCLUDE_OBSERVABILITY:-1}" == "1" ]]; then
  wait_for_http "ghost-observability" "http://localhost:7276/readyz" 30 2
fi

compose_cmd ps > "$ARTIFACT_DIR/compose-ps.txt"

echo "[up] PASS"
