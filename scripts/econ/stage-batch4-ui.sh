#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

git reset
git add -- \
  apps/web/app/econ \
  apps/web/app/api/econ/[...path]/route.ts \
  apps/web/src/lib/econ-api.ts

echo "[batch4] staged files:"
git diff --cached --name-only | sort
echo
echo "[batch4] suggested commit message:"
echo "feat(econ-ui): add control center routes and econ API proxy"
