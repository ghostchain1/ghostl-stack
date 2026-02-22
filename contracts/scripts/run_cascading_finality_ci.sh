#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export FOUNDRY_PROFILE="${FOUNDRY_PROFILE:-default}"

TEST_PATHS=(
  "test/foundry/CascadingFinalityOracles.t.sol"
  "test/foundry/L2L3BridgeCascadingFinality.t.sol"
  "test/foundry/OptimisticRollupCascadingFinality.t.sol"
  "test/foundry/GhostChainBridgeHub.t.sol"
  "test/foundry/MainnetLaunchGate.t.sol"
)

echo "Running cascading finality suite with FOUNDRY_PROFILE=${FOUNDRY_PROFILE}"

for test_path in "${TEST_PATHS[@]}"; do
  echo "==> forge test --match-path ${test_path}"
  forge test --match-path "$test_path"
done
