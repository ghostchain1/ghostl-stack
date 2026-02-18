#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

DEMO_AMOUNT_GST="${DEMO_AMOUNT_GST:-1}"

echo "Demo relay (amount=${DEMO_AMOUNT_GST} GST)"
echo "Requires relayer running with RELAYER_PRIVATE_KEY to submit to L3."

DEMO_AMOUNT_GST="$DEMO_AMOUNT_GST" bash "$ROOT_DIR/infra/scripts/demo-deposit.sh"
bash "$ROOT_DIR/infra/scripts/demo-finalize.sh"

LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit.json"
if [ ! -f "$LAST_DEPOSIT_PATH" ]; then
  echo "Missing $LAST_DEPOSIT_PATH"
  exit 1
fi

EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_DEPOSIT_PATH")"
EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_DEPOSIT_PATH")"

echo "Waiting for relayer to submit to L3 (nonce=$EXPECTED_NONCE)..."
for i in $(seq 1 60); do
  HEALTH="$(curl -sS http://localhost:7171/health || true)"
  RELAYED_NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
  RELAYED_AMOUNT="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
  if [ "$RELAYED_NONCE" = "$EXPECTED_NONCE" ] && [ "$RELAYED_AMOUNT" = "$EXPECTED_AMOUNT_WEI" ]; then
    echo "Relayed."
    echo "$HEALTH" | jq .
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for relayer."
curl -sS http://localhost:7171/health | jq .
exit 1
