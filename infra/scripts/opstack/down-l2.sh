#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample)" >&2
  exit 1
fi

COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi

cd "$OP_DIR"
hg_docker compose "${COMPOSE_ENV_ARGS[@]}" stop l2-geth op-node op-sequencer op-batcher op-proposer >/dev/null 2>&1 || true
hg_docker compose "${COMPOSE_ENV_ARGS[@]}" rm -f l2-geth op-node op-sequencer op-batcher op-proposer >/dev/null 2>&1 || true

echo "Stopped OP Stack L1/L2"
