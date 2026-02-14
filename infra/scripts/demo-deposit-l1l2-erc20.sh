#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_ENV_FILE="$ROOT_DIR/services/stack.env"

unset NODE_OPTIONS

if [ ! -f "$STACK_ENV_FILE" ]; then
  echo "Missing $STACK_ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$STACK_ENV_FILE"
set +a

OPSTACK_SECRETS="$ROOT_DIR/infra/opstack/.env.secrets"
if [ -f "$OPSTACK_SECRETS" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OPSTACK_SECRETS"
  set +a
fi

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "Missing DEPLOYER_PRIVATE_KEY (expected in infra/opstack/.env.secrets or env)" >&2
  exit 1
fi

# Demo flows should default to the funded dev account (often the proposer key) rather than the deployer key.
# Allow override via DEMO_SIGNER_PRIVATE_KEY.
DEMO_SIGNER_PRIVATE_KEY="${DEMO_SIGNER_PRIVATE_KEY:-${PROPOSER_PRIVATE_KEY:-$DEPLOYER_PRIVATE_KEY}}"
if [ -z "$DEMO_SIGNER_PRIVATE_KEY" ]; then
  echo "Missing demo signer private key (set DEMO_SIGNER_PRIVATE_KEY or PROPOSER_PRIVATE_KEY)" >&2
  exit 1
fi

DEMO_AMOUNT_GST="${DEMO_AMOUNT_GST:-1}"
DEMO_ACCOUNT="${DEMO_ACCOUNT:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"

if [ -z "${L1_STANDARD_BRIDGE_ADDRESS:-}" ] || [ -z "${L1_TOKEN_ADDRESS:-}" ] || [ -z "${L2_TOKEN_ADDRESS:-}" ]; then
  echo "Missing L1_STANDARD_BRIDGE_ADDRESS/L1_TOKEN_ADDRESS/L2_TOKEN_ADDRESS in services/stack.env" >&2
  exit 1
fi

L2_MINTABLE_ERC20_FACTORY="${L2_MINTABLE_ERC20_FACTORY:-0x4200000000000000000000000000000000000012}"
cd "$ROOT_DIR/contracts"
ENSURE_OUT="$(DEPLOYER_PRIVATE_KEY="$DEMO_SIGNER_PRIVATE_KEY" \
  L1_TOKEN_ADDRESS="$L1_TOKEN_ADDRESS" L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" \
  L2_MINTABLE_ERC20_FACTORY="$L2_MINTABLE_ERC20_FACTORY" RPC_L1="http://localhost:18545" \
  OP_L2_RPC="http://localhost:29547" \
  npx hardhat run --network ghostl2Op --no-compile scripts/ensure_l2_mintable_erc20.ts 2>&1)"
L2_TOKEN_ADDRESS="$(printf '%s\n' "$ENSURE_OUT" | grep -Eo 'L2_TOKEN_ADDRESS=0x[a-fA-F0-9]{40}' | tail -n1 | cut -d= -f2)"
if [ -z "$L2_TOKEN_ADDRESS" ]; then
  echo "Failed to resolve L2_TOKEN_ADDRESS from ensure_l2_mintable_erc20.ts" >&2
  echo "$ENSURE_OUT" >&2
  exit 1
fi
perl -0777 -i -pe "s/^L2_TOKEN_ADDRESS=.*$/L2_TOKEN_ADDRESS=$L2_TOKEN_ADDRESS/m" "$STACK_ENV_FILE"
if [ -f "$ROOT_DIR/services/ghost-relayer/.env" ]; then
  perl -0777 -i -pe "s/^L2_TOKEN_ADDRESS=.*$/L2_TOKEN_ADDRESS=$L2_TOKEN_ADDRESS/m" "$ROOT_DIR/services/ghost-relayer/.env"
fi

DEMO_AMOUNT_GST="$DEMO_AMOUNT_GST" \
L1_STANDARD_BRIDGE_ADDRESS="$L1_STANDARD_BRIDGE_ADDRESS" \
L1_TOKEN_ADDRESS="$L1_TOKEN_ADDRESS" \
L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" \
DEMO_TO="$DEMO_ACCOUNT" \
  RPC_L1="http://localhost:18545" \
  DEPLOYER_PRIVATE_KEY="$DEMO_SIGNER_PRIVATE_KEY" npx hardhat run --network anvil --no-compile scripts/demo_l1_deposit_erc20.ts

DEMO_ACCOUNT="$DEMO_ACCOUNT" L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" \
  OP_L2_RPC="http://localhost:29547" \
  DEPLOYER_PRIVATE_KEY="$DEMO_SIGNER_PRIVATE_KEY" npx hardhat run --network ghostl2Op --no-compile scripts/demo_balance_l2.ts
