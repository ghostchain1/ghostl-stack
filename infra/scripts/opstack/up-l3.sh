#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample and set keys/chain IDs)" >&2
  exit 1
fi

L3_NAME="${L3_NAME:-ghostl3}"
L3_ENV_FILE="$OP_DIR/l3/$L3_NAME/.env"
if [ ! -f "$L3_ENV_FILE" ]; then
  echo "Missing L3 env file: $L3_ENV_FILE (generate via infra/scripts/opstack/l3/new.sh)" >&2
  exit 1
fi

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"

echo "Ensuring L2 RPC is reachable for L3 settlement..."
if ! curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
  echo "L2 RPC $HOST_L2_RPC is not reachable; start L1/L2 first (infra/scripts/opstack/up-l2.sh)." >&2
  exit 1
fi

echo "Starting OP Stack L3 ($L3_NAME)..."
cd "$OP_DIR"
COMPOSE_FILES=(-f "$OP_DIR/docker-compose.yml" -f "$OP_DIR/docker-compose.l3.yml")
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env" --env-file "$L3_ENV_FILE")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi
# --no-deps prevents auto-starting L1/L2; assume up-l2.sh already ran.
docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps \
  l3-geth l3-op-node l3-op-batcher l3-op-proposer

echo "Waiting for L3 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L3_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L3_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L3 RPC not responding" >&2
    exit 1
  fi
done

echo "OP Stack L3 up. L3=$HOST_L3_RPC"
