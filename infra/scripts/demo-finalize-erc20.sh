#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

ENV_FILE="$ROOT_DIR/services/ghost-guard/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (run: bash infra/scripts/up.sh)"
  exit 1
fi

LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit_erc20.json"
if [ ! -f "$LAST_DEPOSIT_PATH" ]; then
  echo "Missing $LAST_DEPOSIT_PATH (run: bash infra/scripts/demo-deposit-erc20.sh)"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DEMO_TOKEN="$(jq -r '.token' "$LAST_DEPOSIT_PATH")"
DEMO_FROM="$(jq -r '.from' "$LAST_DEPOSIT_PATH")"
DEMO_TO="$(jq -r '.to' "$LAST_DEPOSIT_PATH")"
DEMO_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_DEPOSIT_PATH")"
DEMO_NONCE="$(jq -r '.nonce' "$LAST_DEPOSIT_PATH")"

echo "Finalizing ERC20 deposit:"
echo "  token=$DEMO_TOKEN"
echo "  from=$DEMO_FROM"
echo "  to=$DEMO_TO"
echo "  amountWei=$DEMO_AMOUNT_WEI"
echo "  nonce=$DEMO_NONCE"

cd "$ROOT_DIR/contracts"
DEMO_TOKEN="$DEMO_TOKEN" \
DEMO_FROM="$DEMO_FROM" \
DEMO_TO="$DEMO_TO" \
DEMO_AMOUNT_WEI="$DEMO_AMOUNT_WEI" \
DEMO_NONCE="$DEMO_NONCE" \
npx hardhat run --network ghostl2Op scripts/demo_finalize_erc20.ts
