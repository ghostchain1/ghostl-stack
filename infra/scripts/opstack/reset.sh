#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

echo "Stopping OP Stack devnet..."
cd "$OP_DIR"
docker compose down -v || true

echo "Removing data dirs..."
rm -rf "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
mkdir -p "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"

echo "Reset complete."
