#!/usr/bin/env bash
# scripts/install-git-hooks.sh
# Installs GhostChain branding enforcement git hooks.
# No external dependencies required.
#
# Usage:
#   bash scripts/install-git-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
HUSKY_DIR="$REPO_ROOT/.husky"

echo "GhostChain git hooks installer"
echo "Root: $REPO_ROOT"
echo ""

install_hook() {
  local name="$1"
  local src="$HUSKY_DIR/$name"
  local dst="$HOOKS_DIR/$name"

  if [ ! -f "$src" ]; then
    echo "  [skip] $name — source not found in .husky/"
    return
  fi

  cp "$src" "$dst"
  chmod +x "$dst"
  echo "  [✔]  $name installed to .git/hooks/$name"
}

install_hook "pre-commit"

echo ""
echo "✔ Git hooks installed. Brand enforcement is active on every commit."
echo "  To bypass (emergency only): SKIP_BRAND_CHECK=1 git commit -m '...'"
