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

DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-100}"

echo "Using BRIDGE_L2L3_ADDRESS=$BRIDGE_L2L3_ADDRESS"
echo "Using GUARD_POLICY_ADDRESS=$GUARD_POLICY_ADDRESS"
echo "Sending demo deposit (amount=${DEMO_AMOUNT_ETH} ETH)..."

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_ETH="$DEMO_AMOUNT_ETH" npx hardhat run --network ghostl2 scripts/demo_deposit.ts

echo "Tip: tail guard logs with: cd .devcontainer && docker compose logs -f ghost-guard"

