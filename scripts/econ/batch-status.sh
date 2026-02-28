#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

staged="$(git diff --cached --name-only | sort)"
staged_count="$(printf '%s\n' "$staged" | sed '/^$/d' | wc -l | tr -d ' ')"

echo "[econ-batch] staged files: $staged_count"

if [[ "$staged_count" != "0" ]]; then
  echo "[econ-batch] current staged set:"
  printf '%s\n' "$staged"

  if grep -q '^contracts/src/econ/GhostEconomicEngine.sol$' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 1 (contracts/tests)"
    echo "[econ-batch] next: git commit -m \"feat(econ-contracts): add sovereign routing, governance gate, risk and flywheel tests\""
    exit 0
  fi
  if grep -q '^services/hg-treasury-agent/' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 2 (services)"
    echo "[econ-batch] next: git commit -m \"feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter\""
    exit 0
  fi
  if grep -q '^docker-compose.econ.devnet.yml$' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 3 (infra/observability)"
    echo "[econ-batch] next: git commit -m \"feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability\""
    exit 0
  fi
  if grep -q '^apps/web/app/econ/' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 4 (ui/api)"
    echo "[econ-batch] next: git commit -m \"feat(econ-ui): add control center routes and econ API proxy\""
    exit 0
  fi
  if grep -q '^\.github/workflows/econ-engine.yml$' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 5 (ci/scripts/package)"
    echo "[econ-batch] next: git commit -m \"ci(econ): add routing/governance/secret gates and econ workflow/scripts\""
    exit 0
  fi
  if grep -q '^docs/econ/' <<<"$staged"; then
    echo "[econ-batch] detected: Batch 6 (docs)"
    echo "[econ-batch] next: git commit -m \"docs(econ): add baseline, receipts, production checklist and release handoff\""
    exit 0
  fi

  echo "[econ-batch] staged set does not match predefined batches exactly."
  exit 0
fi

echo "[econ-batch] nothing staged."
echo "[econ-batch] next: bash scripts/econ/stage-next-batch.sh"
