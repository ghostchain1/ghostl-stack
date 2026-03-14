#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

l2_batcher_key="${BATCHER_KEY:-}"
l2_proposer_key="${PROPOSER_KEY:-}"
l3_batcher_key="${L3_BATCHER_KEY:-${BATCHER_KEY:-}}"
l3_proposer_key="${L3_PROPOSER_KEY:-${PROPOSER_KEY:-}}"

l2_settlement_ready=1
l3_settlement_ready=1
[[ -z "$l2_batcher_key" || -z "$l2_proposer_key" ]] && l2_settlement_ready=0
[[ -z "$l3_batcher_key" || -z "$l3_proposer_key" ]] && l3_settlement_ready=0

if [[ "${REQUIRE_SETTLEMENT_KEYS:-1}" == "1" ]]; then
  missing=0
  if [[ "$l2_settlement_ready" -ne 1 ]]; then
    [[ -z "$l2_batcher_key" ]] && echo "[up] missing required key env: BATCHER_KEY" >&2
    [[ -z "$l2_proposer_key" ]] && echo "[up] missing required key env: PROPOSER_KEY" >&2
    missing=1
  fi
  if [[ -z "$l3_batcher_key" ]]; then
    echo "[up] missing required key env: L3_BATCHER_KEY (or fallback BATCHER_KEY)" >&2
    missing=1
  fi
  if [[ -z "$l3_proposer_key" ]]; then
    echo "[up] missing required key env: L3_PROPOSER_KEY (or fallback PROPOSER_KEY)" >&2
    missing=1
  fi
  if [[ "$missing" -ne 0 ]]; then
    echo "[up] FAIL settlement key material missing. Export keys or run with REQUIRE_SETTLEMENT_KEYS=0 for debug-only bring-up." >&2
    exit 1
  fi
fi

up_services=(
  op-gate
  op-gate-l1
  l1-rpc-proxy
  l2-geth
  op-node
  op-sequencer
  rpc-forward-l2-18547
  l3-geth
  l3-op-node
)

settlement_skipped=()

if [[ "$l2_settlement_ready" == "1" ]]; then
  up_services+=(op-batcher op-proposer)
else
  echo "[up] settlement keys missing for L2 batcher/proposer; skipping those services." >&2
  settlement_skipped+=(op-batcher op-proposer)
fi

if [[ "$l3_settlement_ready" == "1" ]]; then
  up_services+=(l3-op-batcher l3-op-proposer)
else
  echo "[up] settlement keys missing for L3 batcher/proposer; skipping those services." >&2
  settlement_skipped+=(l3-op-batcher l3-op-proposer)
fi

if [[ "${#settlement_skipped[@]}" -gt 0 ]]; then
  compose_cmd rm -sf "${settlement_skipped[@]}" >/dev/null 2>&1 || true
fi

if [[ "${INCLUDE_L1_STACK:-0}" == "1" ]]; then
  up_services+=(ghostchain-bootnode ghostchain-node1 ghostchain-node2 ghostchain-rpc-proxy)
fi

if [[ "${INCLUDE_CHALLENGERS:-0}" == "1" ]]; then
  up_services+=(op-challenger l3-op-challenger)
fi

if [[ "${INCLUDE_OBSERVABILITY:-0}" == "1" ]]; then
  up_services+=(prometheus alertmanager loki grafana vector)
fi

if [[ "${INCLUDE_BRIDGE:-0}" == "1" ]]; then
  up_services+=(bridge-service)
fi

if [[ -n "${EXTRA_UP_SERVICES:-}" ]]; then
  while IFS= read -r svc; do
    [[ -n "$svc" ]] && up_services+=("$svc")
  done < <(printf '%s' "$EXTRA_UP_SERVICES" | tr ',' '\n')
fi

compose_cmd up -d --build "${up_services[@]}"

# quick readiness probe for core RPC endpoints
for url in "${RPC_L1}" "${RPC_L2}" "${RPC_L3}"; do
  echo "[up] waiting for $url"
  for _ in $(seq 1 30); do
    if curl -fsS -m 3 -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$url" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
done

compose_cmd ps > "$ARTIFACT_DIR/compose-ps.txt"

echo "[up] PASS"
