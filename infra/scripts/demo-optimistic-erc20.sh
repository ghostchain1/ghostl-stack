#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-1}"

echo "Demo optimistic ERC20 bridge (L2 escrow -> L1 finalize window -> L2 finalize -> L3 mint)"
echo "Requires:"
echo "- rollup proposers funded + running (services/ghost-rollup-proposer/.env.l2/.env.l3)"
echo "- relayer funded on L2+L3 (services/ghost-relayer/.env)"
echo

DEMO_AMOUNT_ETH="$DEMO_AMOUNT_ETH" bash "$ROOT_DIR/infra/scripts/demo-deposit-erc20.sh"

LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit_erc20.json"
EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_DEPOSIT_PATH")"
EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_DEPOSIT_PATH")"

echo "Waiting for relayer to finalize on L2 and mint on L3 (nonce=$EXPECTED_NONCE)..."
for i in $(seq 1 120); do
  HEALTH="$(curl -sS http://localhost:7171/health || true)"
  RELAYED_KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
  RELAYED_NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
  RELAYED_AMOUNT="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
  if [ "$RELAYED_KIND" = "ERC20Finalized" ] && [ "$RELAYED_NONCE" = "$EXPECTED_NONCE" ] && [ "$RELAYED_AMOUNT" = "$EXPECTED_AMOUNT_WEI" ]; then
    echo "Minted on L3."
    echo "$HEALTH" | jq .
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for optimistic ERC20 relay."
curl -sS http://localhost:7171/health | jq .
exit 1

