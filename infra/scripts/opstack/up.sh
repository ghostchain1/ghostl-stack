#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:28545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29545}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
ENABLE_L3="${ENABLE_L3:-1}"

echo "Starting OP Stack L1/L2..."
bash "$ROOT/infra/scripts/opstack/up-l2.sh"

if [ "$ENABLE_L3" = "1" ]; then
  echo "Starting OP Stack L3..."
  bash "$ROOT/infra/scripts/opstack/up-l3.sh"
else
  echo "Skipping L3 (ENABLE_L3=0)"
fi

echo "OP Stack devnet up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC${ENABLE_L3:+ L3=$HOST_L3_RPC}"
