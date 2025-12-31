#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

ENV_FILE="$ROOT_DIR/services/ghost-guard/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (run: bash infra/scripts/up.sh)"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

HEALTH="$(curl -sS http://localhost:7070/health)"
LAST_EVENT="$(echo "$HEALTH" | jq -c '.lastEvent')"
if [ "$LAST_EVENT" = "null" ]; then
  echo "No lastEvent in Ghost Guard yet. Run: bash infra/scripts/demo-deposit.sh"
  exit 1
fi

DEMO_FROM="$(echo "$LAST_EVENT" | jq -r '.from')"
DEMO_TO="$(echo "$LAST_EVENT" | jq -r '.to')"
DEMO_AMOUNT_WEI="$(echo "$LAST_EVENT" | jq -r '.amount')"
DEMO_NONCE="$(echo "$LAST_EVENT" | jq -r '.nonce')"

echo "Finalizing deposit:"
echo "  from=$DEMO_FROM"
echo "  to=$DEMO_TO"
echo "  amountWei=$DEMO_AMOUNT_WEI"
echo "  nonce=$DEMO_NONCE"

cd "$ROOT_DIR/contracts"
DEMO_FROM="$DEMO_FROM" \
DEMO_TO="$DEMO_TO" \
DEMO_AMOUNT_WEI="$DEMO_AMOUNT_WEI" \
DEMO_NONCE="$DEMO_NONCE" \
npx hardhat run --network ghostl2 scripts/demo_finalize.ts

