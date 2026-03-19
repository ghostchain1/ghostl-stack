#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
STRICT_SECRETS="${STRICT_SECRETS:-0}"
INCLUDE_L1_STACK="${INCLUDE_L1_STACK:-1}"
INCLUDE_OBSERVABILITY="${INCLUDE_OBSERVABILITY:-1}"
START_PHASE3_SERVICES="${START_PHASE3_SERVICES:-1}"
START_OBSERVABILITY_STACK="${START_OBSERVABILITY_STACK:-1}"
START_INTERCHAIN_RELAYER="${START_INTERCHAIN_RELAYER:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"

start_services() {
  local compose_file="$1"
  shift
  local services=("$@")

  if [[ ! -f "$compose_file" ]]; then
    echo "Missing compose file: $compose_file" >&2
    return 1
  fi

  if [[ "${#services[@]}" -eq 0 ]]; then
    hg_docker compose -f "$compose_file" up -d
    return 0
  fi

  hg_docker compose -f "$compose_file" up -d "${services[@]}"
}

bash "$ROOT/infra/scripts/env-sync-stack.sh"

echo "Running Ghost-native preflight checks..."
STRICT_SECRETS="$STRICT_SECRETS" bash "$ROOT/scripts/testnet/00-preflight.sh"

echo "Starting GhostChain / GhostL2 / GhostL3 core services..."
export RPC_L1="$HOST_L1_RPC"
export RPC_L2="$HOST_L2_RPC"
export RPC_L3="$HOST_L3_RPC"
export INCLUDE_L1_STACK
export INCLUDE_OBSERVABILITY
bash "$ROOT/scripts/testnet/20-up.sh"

if [[ "$START_OBSERVABILITY_STACK" == "1" ]]; then
  echo "Starting observability bundle..."
  start_services \
    "$ROOT/observability/infra/docker-compose.yml" \
    loki prometheus alertmanager grafana
fi

if [[ "$START_PHASE3_SERVICES" == "1" ]]; then
  echo "Starting Ghost-native control-plane services..."
  start_services \
    "$ROOT/docker-compose.phase3.yml" \
    ghost-mapper ghost-registry ghost-guard ai-monitor bridge-service liquidity-service

  if [[ "$START_INTERCHAIN_RELAYER" == "1" ]]; then
    echo "Starting optional interchain relayer profile..."
    COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}interchain" \
      hg_docker compose -f "$ROOT/docker-compose.phase3.yml" up -d ghost-relayer
  fi
fi

if [[ "$RUN_DOCTOR" == "1" ]]; then
  bash "$ROOT/infra/scripts/doctor.sh" || true
fi

echo "Up complete. L1=$HOST_L1_RPC, L2=$HOST_L2_RPC, L3=$HOST_L3_RPC"
