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

DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-1}"

echo "Using BRIDGE_L2L3_ADDRESS=$BRIDGE_L2L3_ADDRESS"
echo "Using L2_TOKEN_ADDRESS=$L2_TOKEN_ADDRESS"
echo "Sending demo ERC20 deposit (amount=${DEMO_AMOUNT_ETH} tokens)..."

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_ETH="$DEMO_AMOUNT_ETH" npx hardhat run --network ghostl2 scripts/demo_deposit_erc20.ts

