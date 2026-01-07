#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

L3_NAME="${L3_NAME:-ghostl3}"
L3_ENV_FILE="$OP_DIR/l3/$L3_NAME/.env"

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample)" >&2
  exit 0
fi

if [ ! -f "$L3_ENV_FILE" ]; then
  echo "Missing L3 env file: $L3_ENV_FILE (nothing to stop)" >&2
  exit 0
fi

COMPOSE_FILES=(-f "$OP_DIR/docker-compose.yml" -f "$OP_DIR/docker-compose.l3.yml")
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env" --env-file "$L3_ENV_FILE")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi

cd "$OP_DIR"
docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" stop --no-deps \
  l3-geth l3-op-node l3-op-batcher l3-op-proposer >/dev/null 2>&1 || true
docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" rm -f --no-deps \
  l3-geth l3-op-node l3-op-batcher l3-op-proposer >/dev/null 2>&1 || true

echo "Stopped OP Stack L3 ($L3_NAME)"
