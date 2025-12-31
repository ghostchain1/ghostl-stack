#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/ghostl-stack"

sudo rm -rf "$ROOT_DIR/chains/l2/data" "$ROOT_DIR/chains/l3/data"
mkdir -p "$ROOT_DIR/chains/l2" "$ROOT_DIR/chains/l3"

echo "Chain data removed: chains/l2/data and chains/l3/data"
