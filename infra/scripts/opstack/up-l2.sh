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
L1_CONTAINER_RPC="${L1_CONTAINER_RPC:-http://localhost:8545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
L2_CONTAINER_RPC="${L2_CONTAINER_RPC:-http://localhost:8545}"
TAG="${OPSTACK_IMAGE_TAG:-devnet}"
GATE_IMAGE="${OP_GATE_IMAGE:-local/op-gate:0.1.0}"

echo "Checking required images for L1/L2..."
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

echo "Starting OP Stack L1/L2..."
cd "$OP_DIR"
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi

# Bring up L1 first to capture its genesis hash.
docker compose "${COMPOSE_ENV_ARGS[@]}" up -d l1

echo "Waiting for L1 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L1_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L1_RPC"
    break
  fi
  if docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T l1 wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L1_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "OK (container RPC): $L1_CONTAINER_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L1 RPC not responding" >&2
    exit 1
  fi
done


# Fetch L1 genesis block details from inside the L1 container to ensure the hash matches op-node expectations.
for i in $(seq 1 10); do
  set +e
  L1_GENESIS_JSON=$(docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T l1 wget -qO- --header='Content-Type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' "$L1_CONTAINER_RPC" 2>/dev/null)
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ -n "$L1_GENESIS_JSON" ]; then
    break
  fi
  sleep 1
done
if [ -z "$L1_GENESIS_JSON" ]; then
  echo "Failed to query L1 genesis block from l1 container" >&2
  exit 1
fi
L1_GENESIS_HASH=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.hash')
if [ -n "$L1_GENESIS_HASH" ] && [ "$L1_GENESIS_HASH" != "null" ]; then
  tmp_rollup=$(mktemp)
  jq --arg hash "$L1_GENESIS_HASH" '.genesis.l1.hash = $hash' "$OP_DIR/config/rollup.json" >"$tmp_rollup" && mv "$tmp_rollup" "$OP_DIR/config/rollup.json"
  echo "Set rollup genesis.l1.hash=$L1_GENESIS_HASH"

  # Keep l1-chain.json in sync with the live L1 genesis so op-node validation passes.
  L1_TS_HEX=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.timestamp')
  L1_TS_DEC=$((L1_TS_HEX))
  L1_DIFF=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.difficulty')
  L1_GAS_LIMIT=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.gasLimit')
  L1_EXTRA=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.extraData')
  L1_MIX=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.mixHash')
  L1_NONCE=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.nonce')
  L1_BASEFEE=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.baseFeePerGas')
  tmp_l1=$(mktemp)
  jq --arg ts "$L1_TS_HEX" --arg diff "$L1_DIFF" --arg gl "$L1_GAS_LIMIT" --arg extra "$L1_EXTRA" --arg mix "$L1_MIX" --arg nonce "$L1_NONCE" --arg base "$L1_BASEFEE" '
    .timestamp = $ts
    | .difficulty = $diff
    | .gasLimit = $gl
    | .extraData = $extra
    | .mixHash = $mix
    | .nonce = $nonce
    | .baseFeePerGas = $base
  ' "$OP_DIR/config/l1-chain.json" >"$tmp_l1" && mv "$tmp_l1" "$OP_DIR/config/l1-chain.json"

  # Align L2 genesis timestamps with the live L1 genesis time to avoid sequencer time errors.
  tmp_rollup_l2=$(mktemp)
  jq --argjson l2time "$L1_TS_DEC" '.genesis.l2_time = $l2time' "$OP_DIR/config/rollup.json" >"$tmp_rollup_l2" && mv "$tmp_rollup_l2" "$OP_DIR/config/rollup.json"
  tmp_genesis_l2=$(mktemp)
  jq --arg ts "$L1_TS_HEX" '.timestamp = $ts' "$OP_DIR/config/genesis-l2.json" >"$tmp_genesis_l2" && mv "$tmp_genesis_l2" "$OP_DIR/config/genesis-l2.json"
  echo "Aligned L2 genesis timestamp to L1: $L1_TS_HEX ($L1_TS_DEC)"
fi

# Bring up the rest of the stack.
docker compose "${COMPOSE_ENV_ARGS[@]}" up -d l2-geth op-node op-batcher op-proposer

echo "Waiting for L2 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L2_RPC"
    break
  fi
  if docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T l2-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L2_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "OK (container RPC): $L2_CONTAINER_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L2 RPC not responding" >&2
    exit 1
  fi
done

echo "OP Stack L1/L2 up. L1=$HOST_L1_RPC L2=$HOST_L2_RPC"
