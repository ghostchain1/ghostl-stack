#!/usr/bin/env bash
set -euo pipefail

need_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    echo "Missing directory: $dir" >&2
    exit 1
  fi
  if [ ! -f "$dir/package.json" ]; then
    echo "Missing package.json: $dir/package.json" >&2
    exit 1
  fi
}

install_one() {
  local dir="$1"
  echo "Installing deps: $dir"
  cd "$dir"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

if command -v git-lfs >/dev/null 2>&1; then
  # Ensure LFS filters/hooks are configured in this environment.
  git lfs install --local >/dev/null 2>&1 || true
fi

need_dir "$ROOT/contracts"
need_dir "$ROOT/services/ghost-guard"
need_dir "$ROOT/services/ghost-relayer"
need_dir "$ROOT/services/ghost-rollup-proposer"
need_dir "$ROOT/services/ghost-rollup-challenger"

install_one "$ROOT/contracts"
install_one "$ROOT/services/ghost-guard"
install_one "$ROOT/services/ghost-relayer"
install_one "$ROOT/services/ghost-rollup-proposer"
install_one "$ROOT/services/ghost-rollup-challenger"

echo "Deps installed for contracts + services."
