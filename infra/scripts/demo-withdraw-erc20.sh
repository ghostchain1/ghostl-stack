#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

GUARD_ENV="$ROOT_DIR/services/ghost-guard/.env"
RELAYER_ENV="$ROOT_DIR/services/ghost-relayer/.env"

if [ ! -f "$GUARD_ENV" ] || [ ! -f "$RELAYER_ENV" ]; then
  echo "Missing env files (run: bash infra/scripts/up.sh)"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$GUARD_ENV"
# shellcheck disable=SC1090
source "$RELAYER_ENV"
set +a

DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-1}"

echo "Demo withdraw ERC20 (burn on L3 -> release on L2) amount=${DEMO_AMOUNT_ETH}"

if curl -sS http://localhost:7171/health | jq -e '.observeOnly == true' >/dev/null; then
  echo "Relayer is observe-only; set RELAYER_PRIVATE_KEY (and optionally L2_RELAYER_PRIVATE_KEY) and restart ghost-relayer."
  exit 1
fi

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_ETH="$DEMO_AMOUNT_ETH" npx hardhat run --network ghostl3Op scripts/demo_burn_erc20_l3.ts

LAST_WITHDRAW_PATH="$ROOT_DIR/.tmp/last_withdraw_erc20.json"
EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_WITHDRAW_PATH")"
EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_WITHDRAW_PATH")"

echo "Waiting for relayer to release on L2 (nonce=$EXPECTED_NONCE)..."
for i in $(seq 1 60); do
  HEALTH="$(curl -sS http://localhost:7171/health || true)"
  KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
  NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
  AMOUNT="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
  if [ "$KIND" = "ERC20WithdrawReleased" ] && [ "$NONCE" = "$EXPECTED_NONCE" ] && [ "$AMOUNT" = "$EXPECTED_AMOUNT_WEI" ]; then
    echo "Released."
    echo "$HEALTH" | jq .
    break
  fi
  sleep 1
done

echo "L2 balance:"
DEMO_ACCOUNT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" npx hardhat run --network ghostl2Op scripts/demo_balance_l2.ts
echo "L3 balance:"
DEMO_ACCOUNT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 L3_TOKEN_ADDRESS="$L3_TOKEN_ADDRESS" npx hardhat run --network ghostl3Op scripts/demo_balance_l3.ts
