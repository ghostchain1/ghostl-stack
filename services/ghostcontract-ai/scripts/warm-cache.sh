#!/usr/bin/env bash
# GhostContractAI — warm the SQLite repo index by scanning contract files
# Usage: ./scripts/warm-cache.sh [CONTRACTS_DIR]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTRACTS_DIR="${1:-$REPO_ROOT/contracts}"
DB_PATH="${GHOSTAI_DB_PATH:-/tmp/ghost-contract-ai-dev.db}"

echo "🔥 Warming repo index..."
echo "   Contracts: $CONTRACTS_DIR"
echo "   DB: $DB_PATH"

# Use ripgrep to find all sol files and emit a path list
if command -v rg &>/dev/null; then
  SOL_COUNT=$(rg --files --glob "*.sol" "$CONTRACTS_DIR" 2>/dev/null | wc -l)
  echo "   Found $SOL_COUNT Solidity files"
else
  echo "⚠  ripgrep (rg) not found — skipping file scan"
fi

# Run forge build to warm Foundry cache
if command -v forge &>/dev/null; then
  echo "   Running forge build to warm compilation cache..."
  cd "$CONTRACTS_DIR"
  forge build --profile default 2>&1 | tail -5
else
  echo "⚠  forge not found — skipping build cache warm"
fi

echo "✅ Cache warm complete"
