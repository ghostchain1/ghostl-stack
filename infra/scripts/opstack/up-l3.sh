#!/usr/bin/env bash
set -euo pipefail
# Ensure generated configs are readable inside rootless/user-namespaced containers.
umask 022

# Foundry tooling (cast) is typically installed via foundryup into $HOME/.foundry/bin.
export PATH="$HOME/.foundry/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

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
# Load the L3-specific env so chain-id-scoped paths stay consistent.
source "$L3_ENV_FILE"
# Overlay dynamic L3 deployment addresses written by deploy-l3.sh (optional).
[ -f "$OP_DIR/.env.l3" ] && source "$OP_DIR/.env.l3"
set +a

HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
L2_CONTAINER_RPC="${L2_CONTAINER_RPC:-http://localhost:8545}"
L3_CONTAINER_RPC="${L3_CONTAINER_RPC:-http://localhost:8545}"
L3_PARENT_BLOCK="${L3_PARENT_BLOCK:-latest}"
L3_DIR="$OP_DIR/l3/$L3_NAME"
L3_CHAIN_ID="${L3_CHAIN_ID:-903}"
L3_DATA_DIR="$L3_DIR/data-$L3_CHAIN_ID"
L3_OP_NODE_DIR="$L3_DATA_DIR/op-node"
L3_CONFIG_DIR="$L3_DIR/config"
L3_ROLLUP_JSON="$L3_CONFIG_DIR/rollup.json"
L3_L1_CHAIN_JSON="$L3_CONFIG_DIR/l1-chain.json"
L3_GENESIS_JSON="$L3_CONFIG_DIR/genesis.json"
RESET_L3_OP_NODE="${RESET_L3_OP_NODE:-0}"
L3_CHAIN_CONFIG_CHANGED=0

check_required_code() {
  local label="$1" addr="$2" rpc="$3"
  if [ -z "$addr" ]; then
    echo "$label address not set" >&2
    exit 1
  fi
  if [[ "$addr" =~ ^0x0+$ ]]; then
    echo "$label address is zero: $addr" >&2
    exit 1
  fi
  local code="" resp="" err="" rc=0
  for _ in $(seq 1 5); do
    set +e
    resp=$(curl -sS -X POST "$rpc" -H 'content-type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"]}")
    rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -n "$resp" ]; then
      err=$(printf '%s' "$resp" | jq -r '.error.message // empty' 2>/dev/null || true)
      code=$(printf '%s' "$resp" | jq -r '.result // empty' 2>/dev/null || true)
      if [ -n "$err" ]; then
        code=""
      fi
      if [ -n "$code" ] && [ "$code" != "0x" ] && [ "$code" != "0x0" ]; then
        break
      fi
    fi
    sleep 1
  done
  if [ -z "$code" ] || [ "$code" = "0x" ] || [ "$code" = "0x0" ]; then
    code=$(cast code "$addr" --rpc-url "$rpc" 2>/dev/null)
  fi
  if [ -z "$code" ] || [ "$code" = "0x" ] || [ "$code" = "0x0" ]; then
    echo "$label missing bytecode at $addr on $rpc" >&2
    echo "Hint: run infra/scripts/opstack/deploy-l3.sh against the current L2." >&2
    exit 1
  fi
  echo "Guard ok: $label present at $addr"
}

echo "Ensuring L2 RPC is reachable for L3 settlement..."
if ! curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
  if ! hg_docker compose -f "$OP_DIR/docker-compose.yml" --env-file "$OP_DIR/.env" exec -T l2-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L2_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "L2 RPC $HOST_L2_RPC is not reachable; start L1/L2 first (infra/scripts/opstack/up-l2.sh)." >&2
    exit 1
  fi
fi

CANONICAL_GAS_TOKEN_EXPECTED="0x5FbDB2315678afecb367f032d93F642f64180aa3"
for var in CANONICAL_GAS_TOKEN CUSTOM_GAS_TOKEN_ADDRESS GAS_TOKEN_ADDRESS GAS_TOKEN_ADDRESS_L2 GAS_TOKEN_ADDRESS_L3; do
  val="${!var:-}"
  if [ -n "$val" ] && [ "${val,,}" != "${CANONICAL_GAS_TOKEN_EXPECTED,,}" ]; then
    echo "$var must equal canonical gas token ($CANONICAL_GAS_TOKEN_EXPECTED); got $val" >&2
    exit 1
  fi
done
CANONICAL_GAS_TOKEN="$CANONICAL_GAS_TOKEN_EXPECTED"
echo "Canonical gas token locked: $CANONICAL_GAS_TOKEN"
echo "Running L2 parent guards (gas token + SystemConfig)..."
check_required_code "Canonical gas token (L2)" "$CANONICAL_GAS_TOKEN" "$HOST_L2_RPC"
check_required_code "L3 SystemConfig (L2)" "${L3_SYSTEM_CONFIG_ADDRESS:-}" "$HOST_L2_RPC"

if [[ "$L3_PARENT_BLOCK" =~ ^[0-9]+$ ]]; then
  L3_PARENT_BLOCK_HEX=$(printf '0x%x' "$L3_PARENT_BLOCK")
else
  L3_PARENT_BLOCK_HEX="$L3_PARENT_BLOCK"
fi

echo "Syncing L3 config to L2 parent block ${L3_PARENT_BLOCK_HEX}..."
L2_GENESIS_JSON=""
for i in $(seq 1 10); do
  set +e
  L2_GENESIS_JSON=$(curl -fsS -X POST "$HOST_L2_RPC" -H 'Content-Type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockByNumber\",\"params\":[\"${L3_PARENT_BLOCK_HEX}\", false]}")
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
L2_PARENT_NUM_HEX=$(printf '%s' "$L2_GENESIS_JSON" | jq -r '.result.number')
L2_TS_HEX=$(printf '%s' "$L2_GENESIS_JSON" | jq -r '.result.timestamp')
if [ -z "$L2_PARENT_NUM_HEX" ] || [ "$L2_PARENT_NUM_HEX" = "null" ]; then
  echo "Failed to determine L2 parent block number from $HOST_L2_RPC" >&2
  exit 1
fi
L2_PARENT_NUM_DEC=$((L2_PARENT_NUM_HEX))
L2_TS_DEC=$((L2_TS_HEX))
if [ "$L2_TS_DEC" -eq 0 ]; then
  L2_TS_DEC=${FALLBACK_L2_GENESIS_TS:-1700000000}
  L2_TS_HEX=$(printf '0x%x' "$L2_TS_DEC")
  echo "L2 parent timestamp missing; using fallback $L2_TS_HEX ($L2_TS_DEC)"
fi
if [ -f "$L3_ROLLUP_JSON" ]; then
  existing_rollup_hash=$(jq -r '.genesis.l1.hash // empty' "$L3_ROLLUP_JSON" 2>/dev/null || true)
  existing_rollup_num=$(jq -r '.genesis.l1.number // empty' "$L3_ROLLUP_JSON" 2>/dev/null || true)
  if [ "$existing_rollup_hash" != "$L2_GENESIS_HASH" ] || [ "$existing_rollup_num" != "$L2_PARENT_NUM_DEC" ]; then
    L3_CHAIN_CONFIG_CHANGED=1
  fi
fi
if [ -f "$L3_GENESIS_JSON" ] && [ -n "$L2_TS_HEX" ] && [ "$L2_TS_HEX" != "null" ]; then
  existing_genesis_ts=$(jq -r '.timestamp // empty' "$L3_GENESIS_JSON" 2>/dev/null || true)
  if [ "$existing_genesis_ts" != "$L2_TS_HEX" ]; then
    tmp_genesis_ts=$(mktemp)
    jq --arg ts "$L2_TS_HEX" '.timestamp = $ts' "$L3_GENESIS_JSON" >"$tmp_genesis_ts" && mv "$tmp_genesis_ts" "$L3_GENESIS_JSON"
    chmod 644 "$L3_GENESIS_JSON" || true
    echo "Aligned L3 genesis timestamp to L2 parent time: $L2_TS_HEX ($L2_TS_DEC)"
    L3_CHAIN_CONFIG_CHANGED=1
  fi
fi
if [ -n "$L2_GENESIS_HASH" ] && [ "$L2_GENESIS_HASH" != "null" ] && [ -f "$L3_ROLLUP_JSON" ]; then
  tmp_rollup=$(mktemp)
  jq --arg hash "$L2_GENESIS_HASH" --argjson num "$L2_PARENT_NUM_DEC" \
    '.genesis.l1.hash = $hash | .genesis.l1.number = $num' \
    "$L3_ROLLUP_JSON" >"$tmp_rollup" && mv "$tmp_rollup" "$L3_ROLLUP_JSON"
  chmod 644 "$L3_ROLLUP_JSON" || true
  echo "Set L3 rollup genesis.l1.hash=$L2_GENESIS_HASH number=$L2_PARENT_NUM_DEC"
fi
L2_CHAIN_ID="${L2_CHAIN_ID:-901}"
L2_DATA_DIR="$OP_DIR/data/l2-geth-$L2_CHAIN_ID"
synced_l1_chain=0
if [ -d "$L2_DATA_DIR" ]; then
  tmp_dir=$(mktemp -d)
  tmp_genesis=$(mktemp)
  set +e
  cp -a "$L2_DATA_DIR/." "$tmp_dir/" 2>/dev/null
  copy_rc=$?
  set -e
  if [ "$copy_rc" -eq 0 ] && hg_docker run --rm -v "$tmp_dir":/data \
    ghcr.io/ethereum-optimism/op-geth@sha256:523b0ef36e26c3e8b99cc83d4bf2cc23ec94774be888d930159b1d9362733bc0 \
    --verbosity 0 dumpgenesis --datadir /data >"$tmp_genesis" 2>/dev/null; then
    if jq -e '.config.chainId' "$tmp_genesis" >/dev/null 2>&1; then
      mv "$tmp_genesis" "$L3_L1_CHAIN_JSON"
      chmod 644 "$L3_L1_CHAIN_JSON" || true
      echo "Synced L3 l1-chain.json from L2 data dir."
      synced_l1_chain=1
    else
      rm -f "$tmp_genesis"
    fi
  else
    rm -f "$tmp_genesis"
    echo "Warning: failed to snapshot L2 data dir; falling back to genesis-l2.json." >&2
  fi
  # The snapshot may include root-owned files; clear via docker to avoid permission errors.
  hg_docker run --rm -v "$tmp_dir":/data alpine:3.20 sh -lc 'rm -rf /data/* /data/.[!.]* /data/..?* || true' >/dev/null 2>&1 || true
  rm -rf "$tmp_dir" || true
fi
if [ "$synced_l1_chain" -ne 1 ] && [ -f "$OP_DIR/config/genesis-l2.json" ]; then
  cp "$OP_DIR/config/genesis-l2.json" "$L3_L1_CHAIN_JSON"
  # op-node for L3 does not accept config.gasToken in l1-chain.json; strip if present.
  tmp_l3_l1=$(mktemp)
  jq 'del(.config.gasToken)' "$L3_L1_CHAIN_JSON" >"$tmp_l3_l1" && mv "$tmp_l3_l1" "$L3_L1_CHAIN_JSON"
  chmod 644 "$L3_L1_CHAIN_JSON" || true
  echo "Synced L3 l1-chain.json from config/genesis-l2.json (gasToken stripped)."
fi

if [ -d "$L3_DATA_DIR/geth" ] && [ "$L3_CHAIN_CONFIG_CHANGED" -eq 1 ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  backup_dir="$L3_DIR/backups-$ts"
  mkdir -p "$backup_dir"
  mv "$L3_DATA_DIR" "$backup_dir/$(basename "$L3_DATA_DIR")"
  mkdir -p "$L3_DATA_DIR"
  chmod 775 "$L3_DATA_DIR" || true
  echo "Backed up $L3_DATA_DIR to $backup_dir due to config changes."
fi

echo "Starting OP Stack L3 ($L3_NAME) geth..."
cd "$OP_DIR"
COMPOSE_FILES=(-f "$OP_DIR/docker-compose.yml" -f "$OP_DIR/docker-compose.l3.yml")
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env" --env-file "$L3_ENV_FILE")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi
# --no-deps prevents auto-starting L1/L2; assume up-l2.sh already ran.
hg_docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps \
  l3-geth

echo "Waiting for L3 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L3_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L3_RPC"
    break
  fi
  if hg_docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" exec -T l3-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L3_CONTAINER_RPC" >/dev/null 2>&1; then
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
if [ -z "$L3_GENESIS_HASH" ] || [ "$L3_GENESIS_HASH" = "null" ]; then
  L3_GENESIS_HASH=$(hg_docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" exec -T l3-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' "$L3_CONTAINER_RPC" | jq -r '.result.hash' || true)
fi
if [ -n "$L3_GENESIS_HASH" ] && [ "$L3_GENESIS_HASH" != "null" ] && [ -f "$L3_ROLLUP_JSON" ]; then
  # OP-node expects genesis.l2_time to be the parent L2 genesis timestamp, not the L3 timestamp.
  L3_L2_TIME_DEC="$L2_TS_DEC"
  tmp_rollup_l3_hash=$(mktemp)
  jq --arg hash "$L3_GENESIS_HASH" --argjson l2time "$L3_L2_TIME_DEC" '.genesis.l2.hash = $hash | .genesis.l2_time = $l2time' "$L3_ROLLUP_JSON" >"$tmp_rollup_l3_hash" && mv "$tmp_rollup_l3_hash" "$L3_ROLLUP_JSON"
  chmod 644 "$L3_ROLLUP_JSON" || true
  echo "Set L3 rollup genesis.l2.hash=$L3_GENESIS_HASH and genesis.l2_time=$L3_L2_TIME_DEC"
fi

echo "Starting L3 op-node + batcher..."
if [ "$RESET_L3_OP_NODE" = "1" ] && [ -d "$L3_OP_NODE_DIR" ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  mv "$L3_OP_NODE_DIR" "$L3_DATA_DIR/op-node.bak-$ts"
  mkdir -p "$L3_OP_NODE_DIR"
  echo "Reset L3 op-node data dir (backup: $L3_DATA_DIR/op-node.bak-$ts)."
fi
hg_docker compose "${COMPOSE_FILES[@]}" "${COMPOSE_ENV_ARGS[@]}" up -d --no-deps --force-recreate \
  l3-op-node l3-op-batcher

echo "OP Stack L3 up. L3=$HOST_L3_RPC"
