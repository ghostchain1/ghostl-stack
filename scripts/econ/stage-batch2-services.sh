#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

git reset
git add -- \
  services/hg-treasury-agent \
  services/hg-risk-oracle \
  services/hg-reporting-indexer \
  services/hg-proof-snapshotter

echo "[batch2] staged files:"
git diff --cached --name-only | sort
echo
echo "[batch2] suggested commit message:"
echo "feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter"
