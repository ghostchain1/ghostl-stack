#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OP_ENV="$ROOT/infra/opstack/.env"
STACK_ENV="$ROOT/services/stack.env"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd curl

if [ ! -f "$OP_ENV" ]; then
  echo "Missing $OP_ENV (copy infra/opstack/.env.sample and set keys/chain IDs)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$OP_ENV"
[ -f "$ROOT/infra/opstack/.env.secrets" ] && source "$ROOT/infra/opstack/.env.secrets"
set +a

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
ENABLE_L3="${ENABLE_L3:-1}"

START_L1="${START_L1:-1}"
START_SERVICES="${START_SERVICES:-1}"
START_APPS="${START_APPS:-1}"
START_COMPLIANCE="${START_COMPLIANCE:-1}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"

wait_rpc() {
  local url="$1"
  local label="$2"
  for i in $(seq 1 60); do
    if curl -fsS -X POST "$url" -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
      echo "OK: $label ($url)"
      return 0
    fi
    sleep 1
  done
  echo "RPC not responding: $label ($url)" >&2
  return 1
}

if [ "$START_L1" = "1" ]; then
  echo "Starting GhostChain L1..."
  bash "$ROOT/infra/ghostchain/scripts/up.sh"
fi

wait_rpc "$HOST_L1_RPC" "L1 RPC"

echo "Starting OP Stack L2..."
bash "$ROOT/infra/scripts/opstack/up-l2.sh"

if [ "$SKIP_DEPLOY" != "1" ]; then
  echo "Deploying contracts + syncing service envs..."
  bash "$ROOT/infra/scripts/opstack/deploy.sh"
  if [ "$ENABLE_L3" = "1" ]; then
    echo "Deploying L3 parent contracts on L2..."
    bash "$ROOT/infra/scripts/opstack/deploy-l3.sh"
  fi
fi

if [ "$ENABLE_L3" = "1" ]; then
  echo "Starting OP Stack L3..."
  bash "$ROOT/infra/scripts/opstack/up-l3.sh"
fi

if [ "$START_SERVICES" = "1" ]; then
  if [ ! -f "$STACK_ENV" ]; then
    echo "Missing $STACK_ENV (required to start services)." >&2
    exit 1
  fi
  SERVICES_COMPOSE="$ROOT/services/docker-compose.yml"
  if [ ! -f "$SERVICES_COMPOSE" ]; then
    SERVICES_COMPOSE="$ROOT/services/docker-compose.legacy.yml"
  fi
  if [ ! -f "$SERVICES_COMPOSE" ]; then
    echo "Missing services compose file (expected $ROOT/services/docker-compose.yml or docker-compose.legacy.yml)." >&2
    exit 1
  fi
  echo "Starting services..."
  hg_docker compose --env-file "$STACK_ENV" -f "$SERVICES_COMPOSE" up -d
fi

if [ "$START_COMPLIANCE" = "1" ]; then
  echo "Starting compliance service..."
  hg_docker compose -f "$ROOT/docker-compose.yml" up -d
fi

if [ "$START_APPS" = "1" ]; then
  if [ ! -f "$STACK_ENV" ]; then
    echo "Missing $STACK_ENV (required to start apps)." >&2
    exit 1
  fi
  echo "Starting API + web..."
  hg_docker compose --env-file "$STACK_ENV" -f "$ROOT/docker-compose.dev.yml" up -d
fi

if [ "$RUN_DOCTOR" = "1" ]; then
  bash "$ROOT/infra/scripts/doctor.sh" || true
fi

echo "Full stack up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC${ENABLE_L3:+ L3=$HOST_L3_RPC}"
