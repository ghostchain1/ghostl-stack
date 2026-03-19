#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_ENV="$ROOT/services/stack.env"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

rpc_ready() {
  local url="$1"
  local response
  local method
  for method in ghost_chainId eth_chainId; do
    response="$(curl -fsS -m 3 -H 'content-type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":[],\"id\":1}" \
      "$url" 2>/dev/null || true)"
    if [[ "$response" == *'"result"'* ]]; then
      return 0
    fi
  done
  return 1
}

wait_rpc() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local _i
  for _i in $(seq 1 "$attempts"); do
    if rpc_ready "$url"; then
      echo "OK: $label ($url)"
      return 0
    fi
    sleep 1
  done
  echo "RPC not responding: $label ($url)" >&2
  return 1
}

start_services() {
  local compose_file="$1"
  shift
  local services=("$@")
  hg_docker compose -f "$compose_file" up -d "${services[@]}"
}

need_cmd bash
need_cmd curl

bash "$ROOT/infra/scripts/env-sync-stack.sh"

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
START_L1="${START_L1:-1}"
START_SERVICES="${START_SERVICES:-1}"
START_COMPLIANCE="${START_COMPLIANCE:-1}"
START_SOVEREIGN="${START_SOVEREIGN:-1}"
START_APPS="${START_APPS:-1}"
STRICT_SECRETS="${STRICT_SECRETS:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"

if [[ "${SKIP_DEPLOY:-0}" != "0" ]]; then
  echo "WARN: SKIP_DEPLOY is ignored in the Ghost-native path; there is no OP deployment stage." >&2
fi

if [[ "$START_L1" == "1" || "$START_SERVICES" == "1" ]]; then
  START_PHASE3_SERVICES="$START_SERVICES" \
  START_OBSERVABILITY_STACK="$START_SERVICES" \
  START_INTERCHAIN_RELAYER="${START_INTERCHAIN_RELAYER:-0}" \
  RUN_DOCTOR=0 \
  INCLUDE_L1_STACK="$START_L1" \
  STRICT_SECRETS="$STRICT_SECRETS" \
  HOST_L1_RPC="$HOST_L1_RPC" \
  HOST_L2_RPC="$HOST_L2_RPC" \
  HOST_L3_RPC="$HOST_L3_RPC" \
    bash "$ROOT/infra/scripts/up.sh"
fi

wait_rpc "$HOST_L1_RPC" "GhostChain L1 RPC"
wait_rpc "$HOST_L2_RPC" "GhostL2 RPC"
wait_rpc "$HOST_L3_RPC" "GhostL3 RPC"

if [[ "$START_COMPLIANCE" == "1" ]]; then
  need_env POSTGRES_PASSWORD
  need_env COMPLIANCE_JWT_SECRET
  echo "Starting compliance tier..."
  start_services \
    "$ROOT/docker-compose.yml" \
    postgres redis migrate ghost-compliance ghost-compliance-worker
fi

if [[ "$START_SOVEREIGN" == "1" ]]; then
  echo "Starting sovereign economy services..."
  start_services \
    "$ROOT/docker-compose.sovereign.yml" \
    l3-fee-collector l2-revenue-aggregator treasury-engine reward-distributor hyper-ghost-governor
fi

if [[ "$START_APPS" == "1" ]]; then
  if [[ ! -f "$STACK_ENV" ]]; then
    echo "Missing $STACK_ENV (required to start apps)." >&2
    exit 1
  fi
  echo "Starting API, web, and gateway..."
  hg_docker compose \
    --env-file "$STACK_ENV" \
    -f "$ROOT/docker-compose.dev.yml" \
    up -d ghostl-api ghostl-web ghost-gateway
fi

if [[ "$RUN_DOCTOR" == "1" ]]; then
  bash "$ROOT/infra/scripts/doctor.sh" || true
fi

echo "Full stack up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC L3=$HOST_L3_RPC"
