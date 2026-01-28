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

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
ENABLE_L3="${ENABLE_L3:-1}"

echo "Starting GhostChain PoS + OP Stack devnet (L1/L2${ENABLE_L3:+/L3})..."
bash "$ROOT/infra/scripts/opstack/up-l2.sh"
if [ "$ENABLE_L3" = "1" ]; then
  bash "$ROOT/infra/scripts/opstack/up-l3.sh"
fi

echo "Deploying contracts to OP L2 and writing service env files..."
bash "$ROOT/infra/scripts/opstack/deploy.sh"

echo "Starting services (Guard/Relayer/Proposers/Challengers/Obs) against OP RPCs..."
COMPOSE_DIR="$ROOT/.devcontainer"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
GUARD_PORT=7070
if [ ! -f "$COMPOSE_FILE" ]; then
  # Fallback to the services compose bundle when the devcontainer scaffold is absent (e.g., local checkout).
  COMPOSE_DIR="$ROOT/services"
  COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
  if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="$COMPOSE_DIR/docker-compose.legacy.yml"
  fi
fi
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing services compose file (expected $ROOT/.devcontainer/docker-compose.yml or $ROOT/services/docker-compose{.legacy}.yml)." >&2
  exit 1
fi
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ "$COMPOSE_DIR" = "$ROOT/services" ] && [ -f "$COMPOSE_DIR/stack.env" ]; then
  COMPOSE_ARGS=(--env-file "$COMPOSE_DIR/stack.env" -f "$COMPOSE_FILE")
fi
SERVICES=(
  ghost-relayer
  ghost-rollup-proposer
  ghost-rollup-proposer-l2
  ghost-rollup-proposer-l3
  ghost-rollup-challenger
  ghost-rollup-challenger-l2
  ghost-rollup-challenger-l3
  prometheus
  grafana
)
available_services=$(docker compose "${COMPOSE_ARGS[@]}" config --services)
start_services=()
for svc in "${SERVICES[@]}"; do
  if printf '%s\n' "$available_services" | grep -qx "$svc"; then
    start_services+=("$svc")
  fi
done
if [ "${#start_services[@]}" -eq 0 ]; then
  echo "No matching services found in $COMPOSE_FILE (wanted: ${SERVICES[*]})." >&2
  exit 1
fi
docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps "${start_services[@]}"

echo "Done. L1=$HOST_L1_RPC, L2=$HOST_L2_RPC${ENABLE_L3:+, L3=$HOST_L3_RPC}, Guard=$GUARD_PORT, Relayer=7171, ProposerL2=7272, ProposerL3=7373, ChallengerL2=7282, ChallengerL3=7383, Prometheus=9090, Grafana=3000"
