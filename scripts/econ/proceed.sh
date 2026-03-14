#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

staged_count="$(git diff --cached --name-only | wc -l | tr -d ' ')"

if [[ "$staged_count" != "0" ]]; then
  echo "[econ-proceed] staged changes detected; showing status only."
  bash scripts/econ/batch-status.sh
  exit 0
fi

echo "[econ-proceed] no staged changes; staging next batch."
bash scripts/econ/stage-next-batch.sh
echo
echo "[econ-proceed] resulting status:"
bash scripts/econ/batch-status.sh
