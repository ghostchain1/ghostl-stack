#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

git reset
git add -- \
  .github/workflows/econ-engine.yml \
  scripts/econ \
  scripts/simulate-flywheel.sh \
  package.json

echo "[batch5] staged files:"
git diff --cached --name-only | sort
echo
echo "[batch5] suggested commit message:"
echo "ci(econ): add routing/governance/secret gates and econ workflow/scripts"
