#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample and run infra/scripts/opstack/keys/init.sh)" >&2
  exit 1
fi

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:28545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29545}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
ENABLE_L3="${ENABLE_L3:-1}"

echo "Starting OP Stack devnet (L1/L2${ENABLE_L3:+/L3})..."
bash "$ROOT/infra/scripts/opstack/up-l2.sh"
if [ "$ENABLE_L3" = "1" ]; then
  bash "$ROOT/infra/scripts/opstack/up-l3.sh"
fi

echo "Deploying contracts to OP L2 and writing service env files..."
bash "$ROOT/infra/scripts/opstack/deploy.sh"

echo "Starting services (Guard/Relayer/Proposers/Challengers/Obs) against OP RPCs..."
cd "$ROOT/.devcontainer"
SERVICES=(
  ghost-guard
  ghost-relayer
  ghost-rollup-proposer-l2
  ghost-rollup-proposer-l3
  ghost-rollup-challenger-l2
  ghost-rollup-challenger-l3
  prometheus
  grafana
)
docker compose up -d --no-deps "${SERVICES[@]}"

echo "Done. L1=$HOST_L1_RPC, L2=$HOST_L2_RPC${ENABLE_L3:+, L3=$HOST_L3_RPC}, Guard=7070, Relayer=7171, ProposerL2=7272, ProposerL3=7373, ChallengerL2=7282, ChallengerL3=7383, Prometheus=9090, Grafana=3000"
