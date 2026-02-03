#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/services/stack.env}"
POLICY_KEYS_FILE="${POLICY_KEYS_FILE:-$ROOT_DIR/ops/governance/chain-policy-l1.json}"
NETWORK="${POLICY_CHECKPOINT_NETWORK:-anvil}"

export STACK_ENV_FILE
export POLICY_KEYS_FILE

cd "$ROOT_DIR/contracts"
npx hardhat run --network "$NETWORK" scripts/governance/export_policy_checkpoint.ts
