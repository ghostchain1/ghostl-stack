#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_ENV_FILE="$ROOT_DIR/services/stack.env"

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

DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-1}"
DEMO_ACCOUNT="${DEMO_ACCOUNT:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"

if [ -z "${L2_STANDARD_BRIDGE_ADDRESS:-}" ] || [ -z "${L2_TOKEN_ADDRESS:-}" ] || [ -z "${L1_TOKEN_ADDRESS:-}" ]; then
  echo "Missing L2_STANDARD_BRIDGE_ADDRESS/L2_TOKEN_ADDRESS/L1_TOKEN_ADDRESS in services/stack.env" >&2
  exit 1
fi

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_ETH="$DEMO_AMOUNT_ETH" \
L2_STANDARD_BRIDGE_ADDRESS="$L2_STANDARD_BRIDGE_ADDRESS" \
L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" \
L1_TOKEN_ADDRESS="$L1_TOKEN_ADDRESS" \
DEMO_TO="$DEMO_ACCOUNT" \
  OP_L2_RPC="http://localhost:29547" \
  DEPLOYER_PRIVATE_KEY="$DEMO_SIGNER_PRIVATE_KEY" npx hardhat run --network ghostl2Op --no-compile scripts/demo_l2_withdraw_erc20.ts

DEMO_ACCOUNT="$DEMO_ACCOUNT" L1_TOKEN_ADDRESS="$L1_TOKEN_ADDRESS" \
  RPC_L1="http://localhost:18545" \
  DEPLOYER_PRIVATE_KEY="$DEMO_SIGNER_PRIVATE_KEY" npx hardhat run --network anvil --no-compile scripts/demo_balance_l1.ts
