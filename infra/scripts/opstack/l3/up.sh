#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
COMPOSE_BASE="$ROOT/infra/opstack/docker-compose.yml"
COMPOSE_L3="$ROOT/infra/opstack/docker-compose.l3.yml"

NAME="${1:-ghostl3}"
ENV_FILE="$ROOT/infra/opstack/l3/$NAME/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run new.sh first: infra/scripts/opstack/l3/new.sh $NAME" >&2
  exit 1
fi

docker compose --env-file "$ROOT/infra/opstack/.env" --env-file "$ENV_FILE" \
  -f "$COMPOSE_BASE" -f "$COMPOSE_L3" up -d l3-geth l3-op-node l3-op-batcher l3-op-proposer

echo "L3 stack ($NAME) started."
