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

bash "$ROOT/infra/scripts/opstack/validate-mounts.sh" l3

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
L2_CONTAINER_RPC="${L2_CONTAINER_RPC:-http://localhost:8545}"
L3_CONTAINER_RPC="${L3_CONTAINER_RPC:-http://localhost:8545}"
L3_DIR="$OP_DIR/l3/$L3_NAME"
L3_CONFIG_DIR="$L3_DIR/config"
L3_ROLLUP_JSON="$L3_CONFIG_DIR/rollup.json"
L3_L1_CHAIN_JSON="$L3_CONFIG_DIR/l1-chain.json"
RESET_L3_OP_NODE="${RESET_L3_OP_NODE:-0}"

echo "Ensuring L2 RPC is reachable for L3 settlement..."
if ! curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
  if ! docker compose -f "$OP_DIR/docker-compose.yml" --env-file "$OP_DIR/.env" exec -T l2-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L2_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "L2 RPC $HOST_L2_RPC is not reachable; start L1/L2 first (infra/scripts/opstack/up-l2.sh)." >&2
    exit 1
  fi
fi

echo "Syncing L3 config to current L2 genesis..."
L2_GENESIS_JSON=""
for i in $(seq 1 10); do
  set +e
  L2_GENESIS_JSON=$(curl -fsS -X POST "$HOST_L2_RPC" -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}')
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ -n "$L2_GENESIS_JSON" ]; then
    break
  fi
  sleep 1
done
if [ -z "$L2_GENESIS_JSON" ]; then
  echo "Failed to query L2 genesis block from $HOST_L2_RPC" >&2
  exit 1
fi
L2_GENESIS_HASH=$(printf '%s' "$L2_GENESIS_JSON" | jq -r '.result.hash')
L2_TS_HEX=$(printf '%s' "$L2_GENESIS_JSON" | jq -r '.result.timestamp')
L2_TS_DEC=$((L2_TS_HEX))
if [ "$L2_TS_DEC" -eq 0 ]; then
  L2_TS_DEC=${FALLBACK_L2_GENESIS_TS:-1700000000}
  L2_TS_HEX=$(printf '0x%x' "$L2_TS_DEC")
  echo "L2 genesis timestamp missing; using fallback $L2_TS_HEX ($L2_TS_DEC)"
fi
if [ -n "$L2_GENESIS_HASH" ] && [ "$L2_GENESIS_HASH" != "null" ] && [ -f "$L3_ROLLUP_JSON" ]; then
  tmp_rollup=$(mktemp)
  jq --arg hash "$L2_GENESIS_HASH" '.genesis.l1.hash = $hash | .genesis.l1.number = 0' "$L3_ROLLUP_JSON" >"$tmp_rollup" && mv "$tmp_rollup" "$L3_ROLLUP_JSON"
  echo "Set L3 rollup genesis.l1.hash=$L2_GENESIS_HASH"
fi
L2_DATA_DIR="$OP_DIR/data/l2-geth-new2"
if [ -d "$L2_DATA_DIR" ]; then
  tmp_dir=$(mktemp -d)
  tmp_genesis=$(mktemp)
  cp -a "$L2_DATA_DIR/." "$tmp_dir/"
  if docker run --rm -v "$tmp_dir":/data \
    ghcr.io/ethereum-optimism/op-geth@sha256:523b0ef36e26c3e8b99cc83d4bf2cc23ec94774be888d930159b1d9362733bc0 \
    --verbosity 0 dumpgenesis --datadir /data >"$tmp_genesis" 2>/dev/null; then
    if jq -e '.config.chainId' "$tmp_genesis" >/dev/null 2>&1; then
      mv "$tmp_genesis" "$L3_L1_CHAIN_JSON"
      echo "Synced L3 l1-chain.json from L2 data dir."
    else
      rm -f "$tmp_genesis"
    fi
  else
    rm -f "$tmp_genesis"
  fi
  rm -rf "$tmp_dir"
elif [ -f "$OP_DIR/config/genesis-l2.json" ]; then
  cp "$OP_DIR/config/genesis-l2.json" "$L3_L1_CHAIN_JSON"
fi

echo "Starting OP Stack L3 ($L3_NAME) geth..."
cd "$OP_DIR"
COMPOSE_FILES=(-f "$OP_DIR/docker-compose.yml" -f "$OP_DIR/docker-compose.l3.yml")
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env" --env-file "$L3_ENV_FILE")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi
# --no-deps prevents auto-starting L1/L2; assume up-l2.sh already ran.
docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps \
  l3-geth

echo "Waiting for L3 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L3_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L3_RPC"
    break
  fi
  if docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" exec -T l3-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L3_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "OK (container RPC): $L3_CONTAINER_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L3 RPC not responding" >&2
    exit 1
  fi
done

echo "Recording L3 genesis hash into rollup config..."
L3_GENESIS_HASH=$(curl -fsS -X POST "$HOST_L3_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' | jq -r '.result.hash' || true)
L3_TS_HEX=$(curl -fsS -X POST "$HOST_L3_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' | jq -r '.result.timestamp' || true)
if [ -z "$L3_GENESIS_HASH" ] || [ "$L3_GENESIS_HASH" = "null" ]; then
  L3_GENESIS_HASH=$(docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" exec -T l3-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' "$L3_CONTAINER_RPC" | jq -r '.result.hash' || true)
  L3_TS_HEX=$(docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" exec -T l3-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' "$L3_CONTAINER_RPC" | jq -r '.result.timestamp' || true)
fi
if [ -n "$L3_GENESIS_HASH" ] && [ "$L3_GENESIS_HASH" != "null" ] && [ -f "$L3_ROLLUP_JSON" ]; then
  L3_TS_DEC=$((L3_TS_HEX))
  tmp_rollup_l3_hash=$(mktemp)
  jq --arg hash "$L3_GENESIS_HASH" --argjson l2time "$L3_TS_DEC" '.genesis.l2.hash = $hash | .genesis.l2_time = $l2time' "$L3_ROLLUP_JSON" >"$tmp_rollup_l3_hash" && mv "$tmp_rollup_l3_hash" "$L3_ROLLUP_JSON"
  echo "Set L3 rollup genesis.l2.hash=$L3_GENESIS_HASH"
fi

echo "Starting L3 op-node + batcher..."
if [ "$RESET_L3_OP_NODE" = "1" ] && [ -d "$L3_DIR/data/op-node" ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  mv "$L3_DIR/data/op-node" "$L3_DIR/data/op-node.bak-$ts"
  mkdir -p "$L3_DIR/data/op-node"
  echo "Reset L3 op-node data dir (backup: op-node.bak-$ts)."
fi
docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps --force-recreate \
  l3-op-node l3-op-batcher

echo "OP Stack L3 up. L3=$HOST_L3_RPC"
