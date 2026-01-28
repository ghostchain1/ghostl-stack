#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

if [ -f "$OP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_DIR/.env"
  [ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"

# Hardhat network config uses OP_* vars; ensure they follow the host RPCs.
export OP_L2_RPC="${OP_L2_RPC:-$HOST_L2_RPC}"
export OP_L2_CHAIN_ID="${OP_L2_CHAIN_ID:-${L2_CHAIN_ID:-901}}"
export OP_L3_RPC="${OP_L3_RPC:-${HOST_L3_RPC:-http://localhost:39545}}"
export OP_L3_CHAIN_ID="${OP_L3_CHAIN_ID:-902}"

# Deploy script also reads these for cross-chain contracts.
export RPC_L1="${RPC_L1:-$HOST_L1_RPC}"
export RPC_L2="${RPC_L2:-$HOST_L2_RPC}"
export RPC_L3="${RPC_L3:-${HOST_L3_RPC:-http://localhost:39545}}"

cd "$ROOT/contracts"

if [ ! -d node_modules ]; then
  echo "Installing contract deps..."
  npm ci --no-audit --no-fund
fi

if [ "${SECURITY_CHECKPOINTS:-0}" = "1" ]; then
  echo "Running security checkpoints (foundry + slither)..."
  npm run test:foundry
  npm run formal:slither
fi

echo "Deploying GhostChain PoS/L1 stack and bridging glue..."
HARDHAT_VIA_IR=${HARDHAT_VIA_IR:-true} npm run deploy:futuristic

echo "Deploying OP devnet contracts (network: ghostl2Op)..."
npm run deploy:op

echo "Contracts deployed. Service env files were updated under services/."
