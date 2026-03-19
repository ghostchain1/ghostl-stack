#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

rpc_call() {
  local url="$1"
  local response
  local method
  for method in ghost_chainId eth_chainId; do
    response="$(curl -fsS -m 5 -H 'content-type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":[],\"id\":1}" "$url" 2>/dev/null || true)"
    if [[ "$response" == *'"result"'* ]]; then
      printf '%s' "$response"
      return 0
    fi
  done
  return 1
}

L1_JSON="$(rpc_call "${RPC_L1:-http://localhost:18545}")"
L2_JSON="$(rpc_call "${RPC_L2:-http://localhost:29547}")"
L3_JSON="$(rpc_call "${RPC_L3:-http://localhost:39545}")"

echo "$L1_JSON" > "$ARTIFACT_DIR/l1-chainid.json"
echo "$L2_JSON" > "$ARTIFACT_DIR/l2-chainid.json"
echo "$L3_JSON" > "$ARTIFACT_DIR/l3-chainid.json"

RPC_L1="${RPC_L1:-http://localhost:18545}" \
RPC_L2="${RPC_L2:-http://localhost:29547}" \
RPC_L3="${RPC_L3:-http://localhost:39545}" \
L3_PARENT_L2_RPC="${L3_PARENT_L2_RPC:-http://localhost:29547}" \
bash "$ROOT_DIR/scripts/verify-routing.sh"

curl -fsS http://localhost:7260/status > "$ARTIFACT_DIR/ghost-exec-l2.status.json"
curl -fsS http://localhost:7263/status > "$ARTIFACT_DIR/ghost-settlement-l2.status.json"
curl -fsS http://localhost:7270/status > "$ARTIFACT_DIR/ghost-exec-l3.status.json"
curl -fsS http://localhost:7273/status > "$ARTIFACT_DIR/ghost-settlement-l3.status.json"

if curl -fsS http://localhost:7276/status > "$ARTIFACT_DIR/ghost-observability.status.json" 2>/dev/null; then
  :
fi

# strict release-gate: require explicit tx proof bundle from rehearsal
required=(L3_TX_HASH L2_INCLUSION_TX_HASH L1_SETTLEMENT_TX_HASH MESSENGER_ROUNDTRIP_PROOF)
missing=0
for v in "${required[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "[verify] missing required proof env: $v" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "[verify] FAIL proof bundle incomplete. Provide tx hashes/proof artifacts before GO." >&2
  exit 1
fi

cat > "$ARTIFACT_DIR/tx-proof-bundle.json" <<JSON
{
  "l3_tx_hash": "${L3_TX_HASH}",
  "l2_inclusion_tx_hash": "${L2_INCLUSION_TX_HASH}",
  "l1_settlement_tx_hash": "${L1_SETTLEMENT_TX_HASH}",
  "messenger_roundtrip_proof": "${MESSENGER_ROUNDTRIP_PROOF}",
  "verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

echo "[verify] PASS"
