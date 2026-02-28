#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

git reset
git add -- docs/econ

echo "[batch6] staged files:"
git diff --cached --name-only | sort
echo
echo "[batch6] suggested commit message:"
echo "docs(econ): add baseline, receipts, production checklist and release handoff"
