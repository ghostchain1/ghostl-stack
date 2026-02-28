#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR/contracts"

forge test --match-path test/foundry/GhostEconomicFlywheel.t.sol --match-test testSchedulerBlockedWhenMainnetGateClosed
