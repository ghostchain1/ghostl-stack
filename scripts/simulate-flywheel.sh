#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"

cd "$CONTRACTS_DIR"

echo "[flywheel] Running Ghost Economic Flywheel Foundry suite"
forge test --match-path test/foundry/GhostEconomicFlywheel.t.sol -vv

echo "[flywheel] Running routing law invariants"
forge test --match-path test/foundry/GhostEconomicRouting.t.sol -vv

echo "[flywheel] Running governance/risk suite"
forge test --match-path test/foundry/GhostEconomicGovernanceRisk.t.sol -vv

echo "[flywheel] Completed"
