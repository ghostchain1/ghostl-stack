#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

sudo rm -rf "$ROOT_DIR/chains/l2/data" "$ROOT_DIR/chains/l3/data"
mkdir -p "$ROOT_DIR/chains/l2" "$ROOT_DIR/chains/l3"

echo "Chain data removed: chains/l2/data and chains/l3/data"
