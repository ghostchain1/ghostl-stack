#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

staged_count="$(git diff --cached --name-only | wc -l | tr -d ' ')"
if [[ "$staged_count" != "0" ]]; then
  echo "[next-batch] staged changes already present ($staged_count file(s))."
  echo "[next-batch] commit or unstage first; refusing to alter index."
  git diff --cached --name-only | sort
  exit 0
fi

has_commit() {
  git log --fixed-strings --grep "$1" --oneline | grep -q .
}

if ! has_commit "feat(econ-contracts): add sovereign routing, governance gate, risk and flywheel tests"; then
  echo "[next-batch] staging Batch 1 (contracts/tests)"
  git add -- \
    contracts/src/econ/GhostEconomicEngine.sol \
    contracts/test/foundry/GhostEconomicRouting.t.sol \
    contracts/test/foundry/GhostEconomicGovernanceRisk.t.sol \
    contracts/test/foundry/GhostEconomicFlywheel.t.sol
  git diff --cached --name-only | sort
  exit 0
fi

if ! has_commit "feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter"; then
  echo "[next-batch] staging Batch 2 (services)"
  bash scripts/econ/stage-batch2-services.sh
  exit 0
fi

if ! has_commit "feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability"; then
  echo "[next-batch] staging Batch 3 (infra/observability)"
  bash scripts/econ/stage-batch3-infra.sh
  exit 0
fi

if ! has_commit "feat(econ-ui): add control center routes and econ API proxy"; then
  echo "[next-batch] staging Batch 4 (ui/api)"
  bash scripts/econ/stage-batch4-ui.sh
  exit 0
fi

if ! has_commit "ci(econ): add routing/governance/secret gates and econ workflow/scripts"; then
  echo "[next-batch] staging Batch 5 (ci/scripts/package)"
  bash scripts/econ/stage-batch5-ci.sh
  exit 0
fi

if ! has_commit "docs(econ): add baseline, receipts, production checklist and release handoff"; then
  echo "[next-batch] staging Batch 6 (docs)"
  bash scripts/econ/stage-batch6-docs.sh
  exit 0
fi

echo "[next-batch] all planned econ batches appear committed."
