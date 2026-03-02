#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample and set keys/addresses)" >&2
  exit 1
fi

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

ENABLE_L3="${ENABLE_L3:-1}"
L3_NAME="${L3_NAME:-ghostl3}"
L3_ENV_FILE="$OP_DIR/l3/$L3_NAME/.env"

if [ "$ENABLE_L3" = "1" ] && [ ! -f "$L3_ENV_FILE" ]; then
  echo "Missing L3 env file: $L3_ENV_FILE (generate via infra/scripts/opstack/l3/new.sh or set ENABLE_L3=0)" >&2
  exit 1
fi

echo "Ensuring L1/L2${ENABLE_L3:+/L3} stack is up..."
bash "$SCRIPT_DIR/up.sh"

cd "$OP_DIR"
COMPOSE_FILES=(-f "$OP_DIR/docker-compose.yml" -f "$OP_DIR/docker-compose.challengers.yml" -f "$OP_DIR/docker-compose.l3.yml")
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
SERVICES=(op-challenger)

if [ "$ENABLE_L3" = "1" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$L3_ENV_FILE")
  SERVICES+=(l3-op-challenger)
fi
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi

echo "Starting challenger services: ${SERVICES[*]}"
hg_docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps "${SERVICES[@]}"

echo "Challengers are starting. Metrics: L2=${L2_CHALLENGER_METRICS_HOST_PORT:-7303} L3=${L3_CHALLENGER_METRICS_HOST_PORT:-8303}"
