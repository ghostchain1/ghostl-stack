#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample and set keys/chain IDs)" >&2
  exit 1
fi

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:28545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29545}"
TAG="${OPSTACK_IMAGE_TAG:-devnet}"
GATE_IMAGE="${OP_GATE_IMAGE:-local/op-gate:0.1.0}"

echo "Checking required images..."
missing=()
for img in "local/op-geth:${TAG}" "local/op-node:${TAG}" "local/op-batcher:${TAG}" "local/op-proposer:${TAG}" "${GATE_IMAGE}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    missing+=("$img")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing images: ${missing[*]}"
  echo "Run: OPSTACK_IMAGE_TAG=${TAG} bash infra/scripts/opstack/build.sh"
  echo "Run: docker build -t ${GATE_IMAGE} -f infra/opstack/gate/Dockerfile infra/opstack/gate"
  exit 1
fi

echo "Starting OP Stack devnet (L1+L2)..."
cd "$OP_DIR"
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi
docker compose "${COMPOSE_ENV_ARGS[@]}" up -d l1 l2-geth op-node op-batcher op-proposer

echo "Waiting for L2 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L2_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L2 RPC not responding" >&2
    exit 1
  fi
done

echo "OP Stack devnet up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC"
