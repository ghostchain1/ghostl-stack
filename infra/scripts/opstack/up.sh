#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
ENABLE_L3="${ENABLE_L3:-1}"
ENABLE_AI="${ENABLE_AI:-0}"

args=("$@")
idx=0
while [ "$idx" -lt "$#" ]; do
  case "${args[$idx]}" in
    --ai)
      ENABLE_AI=1
      ;;
    --no-ai)
      ENABLE_AI=0
      ;;
    --profile)
      next="${args[$((idx + 1))]:-}"
      if [ "$next" = "ai" ]; then
        ENABLE_AI=1
      fi
      idx=$((idx + 1))
      ;;
  esac
  idx=$((idx + 1))
done

echo "Starting OP Stack L2 (external L1 expected at $HOST_L1_RPC)..."
bash "$ROOT/infra/scripts/opstack/up-l2.sh"

if [ "$ENABLE_L3" = "1" ]; then
  echo "Starting OP Stack L3..."
  bash "$ROOT/infra/scripts/opstack/up-l3.sh"
else
  echo "Skipping L3 (ENABLE_L3=0)"
fi

if [ "$ENABLE_AI" = "1" ]; then
  OP_DIR="$ROOT/infra/opstack"
  if [ ! -f "$OP_DIR/.env" ]; then
    echo "Missing $OP_DIR/.env (copy .env.sample and set keys/chain IDs)" >&2
    exit 1
  fi
  echo "Starting AI profile services..."
  COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
  if [ -f "$OP_DIR/.env.secrets" ]; then
    COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
  fi
  docker compose -f "$OP_DIR/docker-compose.yml" "${COMPOSE_ENV_ARGS[@]}" --profile ai up -d \
    gas-engine-postgres gas-engine-redis ghost-gas-engine ghost-gas-engine-worker
else
  echo "Skipping AI profile services (ENABLE_AI=0)"
fi

echo "OP Stack devnet up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC${ENABLE_L3:+ L3=$HOST_L3_RPC}"
