#!/usr/bin/env bash
set -euo pipefail

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

bash "$ROOT/infra/scripts/opstack/validate-mounts.sh" l2

set -a
source "$OP_DIR/.env"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
set +a

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
L2_CONTAINER_RPC="${L2_CONTAINER_RPC:-http://localhost:8545}"
TAG="${OPSTACK_IMAGE_TAG:-devnet}"
GATE_IMAGE="${OP_GATE_IMAGE:-local/op-gate:0.1.0}"
L1_ORIGIN_BLOCK="${L1_ORIGIN_BLOCK:-latest}"
ENABLE_OP_BATCHER="${ENABLE_OP_BATCHER:-auto}"
ENABLE_OP_PROPOSER="${ENABLE_OP_PROPOSER:-auto}"
OP_NODE_RPC="${OP_NODE_RPC:-http://localhost:${OP_NODE_PROXY_HOST_PORT:-29546}}"
OP_SEQUENCER_RPC="${OP_SEQUENCER_RPC:-http://localhost:${OP_SEQUENCER_PROXY_HOST_PORT:-29646}}"
L2_DATA_DIR="$OP_DIR/data/l2-geth-${L2_CHAIN_ID:-901}"
OP_NODE_DATA_DIR="$OP_DIR/data/op-node"
OP_SEQUENCER_DATA_DIR="$OP_DIR/data/op-sequencer"
L2_CHAIN_CONFIG_CHANGED=0
L2_ROLLUP_CONFIG_CHANGED=0

PREV_ROLLUP_L1_HASH="$(jq -r '.genesis.l1.hash // empty' "$OP_DIR/config/rollup.json" 2>/dev/null || true)"
PREV_ROLLUP_L1_NUM="$(jq -r '.genesis.l1.number // empty' "$OP_DIR/config/rollup.json" 2>/dev/null || true)"
PREV_ROLLUP_L2_TIME="$(jq -r '.genesis.l2_time // empty' "$OP_DIR/config/rollup.json" 2>/dev/null || true)"
PREV_ROLLUP_BATCHER_ADDR="$(jq -r '.genesis.system_config.batcherAddr // empty' "$OP_DIR/config/rollup.json" 2>/dev/null || true)"
PREV_GENESIS_L2_TS="$(jq -r '.timestamp // empty' "$OP_DIR/config/genesis-l2.json" 2>/dev/null || true)"

rpc_call() {
  local rpc="$1"
  local method="$2"
  local params="$3"
  curl -fsS -X POST "$rpc" -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
}

rollup_sync_call() {
  local rpc="$1"
  rpc_call "$rpc" "ghost_compat_syncStatus" '[]'
}

rpc_get_code() {
  local rpc="$1"
  local address="$2"
  rpc_call "$rpc" "eth_getCode" "[\"${address}\",\"latest\"]" | jq -r '.result // empty'
}

derive_address_from_key() {
  local private_key="$1"
  [ -n "$private_key" ] || return 1
  node - "$ROOT" "$private_key" <<'NODE'
const [root, privateKey] = process.argv.slice(2);
process.chdir(root);
const { Wallet } = require("ethers");
process.stdout.write(new Wallet(privateKey.trim()).address);
NODE
}

ACTIVE_BATCH_SENDER_ADDRESS="${BATCH_SENDER_ADDRESS:-}"
if [ -n "${BATCHER_KEY:-}" ]; then
  if derived_batcher_addr="$(derive_address_from_key "$BATCHER_KEY" 2>/dev/null)"; then
    ACTIVE_BATCH_SENDER_ADDRESS="$derived_batcher_addr"
  fi
fi
if [ -z "$ACTIVE_BATCH_SENDER_ADDRESS" ]; then
  echo "Missing active batch sender address; set BATCH_SENDER_ADDRESS or BATCHER_KEY." >&2
  exit 1
fi

echo "Checking required images for L1/L2..."
missing=()
for img in "local/op-geth:${TAG}" "local/op-node:${TAG}" "local/op-batcher:${TAG}" "local/op-proposer:${TAG}" "${GATE_IMAGE}"; do
  if ! hg_docker image inspect "$img" >/dev/null 2>&1; then
    missing+=("$img")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing images: ${missing[*]}"
  echo "Run: OPSTACK_IMAGE_TAG=${TAG} bash infra/scripts/opstack/build.sh"
  echo "Run: docker build -t ${GATE_IMAGE} -f infra/opstack/gate/Dockerfile infra/opstack/gate"
  exit 1
fi

echo "Starting OP Stack L2 (expecting external L1 at $HOST_L1_RPC)..."
cd "$OP_DIR"
COMPOSE_ENV_ARGS=(--env-file "$OP_DIR/.env")
if [ -f "$OP_DIR/.env.secrets" ]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OP_DIR/.env.secrets")
fi

echo "Waiting for L1 RPC..."
for i in $(seq 1 60); do
  if rpc_call "$HOST_L1_RPC" "eth_chainId" '[]' >/dev/null 2>&1; then
    echo "OK: $HOST_L1_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L1 RPC not responding" >&2
    exit 1
  fi
done

L1_LATEST_JSON="$(rpc_call "$HOST_L1_RPC" "eth_getBlockByNumber" '["latest", false]')"
L1_HAS_BLOB_FIELDS="$(printf '%s' "$L1_LATEST_JSON" | jq -r '(.result.excessBlobGas != null) and (.result.blobGasUsed != null)')"
BATCHER_SKIP_REASON=""
case "${ENABLE_OP_BATCHER}" in
  0|false|FALSE|no|NO)
    BATCHER_SKIP_REASON="disabled by ENABLE_OP_BATCHER=${ENABLE_OP_BATCHER}"
    ;;
esac
if [ "$ENABLE_OP_BATCHER" = "auto" ] || [ -z "$ENABLE_OP_BATCHER" ]; then
  if [ "$L1_HAS_BLOB_FIELDS" != "true" ]; then
    echo "L1 latest block has no blob gas fields; relying on l1-rpc-proxy/op-gate-l1 synthetic blob compatibility."
  fi
fi

GAME_FACTORY_ADDR="${L2_GAME_FACTORY_ADDRESS:-0x8A791620dd6260079BF849Dc5567aDC3F2FdC318}"
L2OO_ADDR="${L2OO_ADDRESS:-0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9}"
GAME_FACTORY_CODE="$(rpc_get_code "$HOST_L1_RPC" "$GAME_FACTORY_ADDR" || true)"
L2OO_CODE="$(rpc_get_code "$HOST_L1_RPC" "$L2OO_ADDR" || true)"
PROPOSER_SKIP_REASON=""
case "${ENABLE_OP_PROPOSER}" in
  0|false|FALSE|no|NO)
    PROPOSER_SKIP_REASON="disabled by ENABLE_OP_PROPOSER=${ENABLE_OP_PROPOSER}"
    ;;
  auto|"")
    if [ -z "$GAME_FACTORY_CODE" ] || [ "$GAME_FACTORY_CODE" = "0x" ]; then
      if [ -z "$L2OO_CODE" ] || [ "$L2OO_CODE" = "0x" ]; then
        PROPOSER_SKIP_REASON="no proposal contract code at ${GAME_FACTORY_ADDR} or ${L2OO_ADDR}"
      fi
    fi
    ;;
esac

# Fetch L1 genesis block (block 0) for chain config validation.
L1_GENESIS_JSON=""
for i in $(seq 1 10); do
  set +e
  L1_GENESIS_JSON=$(curl -fsS -X POST "$HOST_L1_RPC" -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}')
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ -n "$L1_GENESIS_JSON" ]; then
    break
  fi
  sleep 1
done
if [ -z "$L1_GENESIS_JSON" ]; then
  echo "Failed to query L1 genesis block from $HOST_L1_RPC" >&2
  exit 1
fi
L1_GENESIS_HASH=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.hash')
L1_GENESIS_NUM_HEX=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.number')
L1_GENESIS_NUM_DEC=$((L1_GENESIS_NUM_HEX))
L1_GENESIS_TS_HEX=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.timestamp')
if [ -z "$L1_GENESIS_TS_HEX" ] || [ "$L1_GENESIS_TS_HEX" = "null" ]; then
  L1_GENESIS_TS_DEC=${FALLBACK_L1_GENESIS_TS:-1700000000}
  L1_GENESIS_TS_HEX=$(printf '0x%x' "$L1_GENESIS_TS_DEC")
  echo "L1 genesis timestamp missing; using fallback $L1_GENESIS_TS_HEX ($L1_GENESIS_TS_DEC)"
else
  # Accept a legitimate 0x0 timestamp instead of forcing a fallback.
  L1_GENESIS_TS_DEC=$((L1_GENESIS_TS_HEX))
fi

# Determine which L1 block to anchor the rollup genesis to (default: block 0).
if [ -z "$L1_ORIGIN_BLOCK" ]; then
  L1_ORIGIN_BLOCK="latest"
fi
if [ "$L1_ORIGIN_BLOCK" = "latest" ] || [ "$L1_ORIGIN_BLOCK" = "head" ]; then
  L1_ORIGIN_TAG="latest"
elif [[ "$L1_ORIGIN_BLOCK" =~ ^[0-9]+$ ]]; then
  L1_ORIGIN_TAG=$(printf '0x%x' "$L1_ORIGIN_BLOCK")
else
  L1_ORIGIN_TAG="$L1_ORIGIN_BLOCK"
fi

L1_ORIGIN_JSON="$L1_GENESIS_JSON"
if [ "$L1_ORIGIN_TAG" != "0x0" ] && [ "$L1_ORIGIN_TAG" != "0x00" ]; then
  L1_ORIGIN_JSON=""
  for i in $(seq 1 10); do
    set +e
    L1_ORIGIN_JSON=$(curl -fsS -X POST "$HOST_L1_RPC" -H 'Content-Type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockByNumber\",\"params\":[\"${L1_ORIGIN_TAG}\", false]}")
    rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -n "$L1_ORIGIN_JSON" ]; then
      break
    fi
    sleep 1
  done
  if [ -z "$L1_ORIGIN_JSON" ]; then
    echo "Failed to query L1 origin block (${L1_ORIGIN_TAG}) from $HOST_L1_RPC" >&2
    exit 1
  fi
fi

L1_ORIGIN_HASH=$(printf '%s' "$L1_ORIGIN_JSON" | jq -r '.result.hash')
L1_ORIGIN_NUM_HEX=$(printf '%s' "$L1_ORIGIN_JSON" | jq -r '.result.number')
L1_ORIGIN_NUM_DEC=$((L1_ORIGIN_NUM_HEX))
L1_ORIGIN_TS_HEX=$(printf '%s' "$L1_ORIGIN_JSON" | jq -r '.result.timestamp')
if [ -z "$L1_ORIGIN_TS_HEX" ] || [ "$L1_ORIGIN_TS_HEX" = "null" ]; then
  L1_ORIGIN_TS_DEC=${FALLBACK_L2_GENESIS_TS:-1700000000}
  L1_ORIGIN_TS_HEX=$(printf '0x%x' "$L1_ORIGIN_TS_DEC")
  echo "L1 origin timestamp missing; using fallback $L1_ORIGIN_TS_HEX ($L1_ORIGIN_TS_DEC)"
else
  L1_ORIGIN_TS_DEC=$((L1_ORIGIN_TS_HEX))
fi

if [ -n "$L1_ORIGIN_HASH" ] && [ "$L1_ORIGIN_HASH" != "null" ]; then
  tmp_rollup=$(mktemp)
  jq --arg hash "$L1_ORIGIN_HASH" --argjson num "$L1_ORIGIN_NUM_DEC" '.genesis.l1.hash = $hash | .genesis.l1.number = $num' "$OP_DIR/config/rollup.json" >"$tmp_rollup" && mv "$tmp_rollup" "$OP_DIR/config/rollup.json"
  chmod 644 "$OP_DIR/config/rollup.json" || true
  echo "Set rollup genesis.l1.hash=$L1_ORIGIN_HASH number=$L1_ORIGIN_NUM_DEC"

  tmp_rollup_batcher=$(mktemp)
  jq --arg batcher "$ACTIVE_BATCH_SENDER_ADDRESS" '.genesis.system_config.batcherAddr = $batcher' "$OP_DIR/config/rollup.json" >"$tmp_rollup_batcher" && mv "$tmp_rollup_batcher" "$OP_DIR/config/rollup.json"
  chmod 644 "$OP_DIR/config/rollup.json" || true
  echo "Authorized L2 batch sender: $ACTIVE_BATCH_SENDER_ADDRESS"

  # Keep l1-chain.json in sync with block 0 so op-node validation stays consistent.
  L1_DIFF=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.difficulty')
  L1_GAS_LIMIT=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.gasLimit')
  L1_EXTRA=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.extraData')
  L1_MIX=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.mixHash')
  L1_NONCE=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.nonce')
  L1_BASEFEE=$(printf '%s' "$L1_GENESIS_JSON" | jq -r '.result.baseFeePerGas')
  tmp_l1=$(mktemp)
  jq --arg ts "$L1_GENESIS_TS_HEX" --arg diff "$L1_DIFF" --arg gl "$L1_GAS_LIMIT" --arg extra "$L1_EXTRA" --arg mix "$L1_MIX" --arg nonce "$L1_NONCE" --arg base "$L1_BASEFEE" '
    .timestamp = $ts
    | .difficulty = $diff
    | .gasLimit = $gl
    | .extraData = $extra
    | .mixHash = $mix
    | .nonce = $nonce
    | .baseFeePerGas = $base
  ' "$OP_DIR/config/l1-chain.json" >"$tmp_l1" && mv "$tmp_l1" "$OP_DIR/config/l1-chain.json"
  chmod 644 "$OP_DIR/config/l1-chain.json" || true

  # Pin L2 genesis time to the chosen L1 origin (default: genesis), but avoid a 0 timestamp which op-node rejects.
  L2_GENESIS_TS_DEC="$L1_ORIGIN_TS_DEC"
  if [ "$L2_GENESIS_TS_DEC" -eq 0 ]; then
    L2_GENESIS_TS_DEC=${FALLBACK_L2_GENESIS_TS:-1700000000}
  fi
  L2_GENESIS_TS_HEX=$(printf '0x%x' "$L2_GENESIS_TS_DEC")
  tmp_rollup_l2=$(mktemp)
  jq --argjson l2time "$L2_GENESIS_TS_DEC" '.genesis.l2_time = $l2time' "$OP_DIR/config/rollup.json" >"$tmp_rollup_l2" && mv "$tmp_rollup_l2" "$OP_DIR/config/rollup.json"
  chmod 644 "$OP_DIR/config/rollup.json" || true
  tmp_genesis_l2=$(mktemp)
  jq --arg ts "$L2_GENESIS_TS_HEX" '.timestamp = $ts' "$OP_DIR/config/genesis-l2.json" >"$tmp_genesis_l2" && mv "$tmp_genesis_l2" "$OP_DIR/config/genesis-l2.json"
  chmod 644 "$OP_DIR/config/genesis-l2.json" || true
  echo "Pinned L2 genesis timestamp to $L2_GENESIS_TS_HEX ($L2_GENESIS_TS_DEC)"

  # Keep checksum file in sync so `doctor-l2.sh` can detect intentional config changes deterministically.
  (
    cd "$OP_DIR/config"
    sha256sum genesis-l2.json rollup.json > checksums.txt
  )
fi

if [ "$PREV_ROLLUP_L1_HASH" != "$L1_ORIGIN_HASH" ] || [ "$PREV_ROLLUP_L1_NUM" != "$L1_ORIGIN_NUM_DEC" ] || [ "$PREV_ROLLUP_L2_TIME" != "$L2_GENESIS_TS_DEC" ]; then
  L2_ROLLUP_CONFIG_CHANGED=1
fi
if [ "$PREV_ROLLUP_BATCHER_ADDR" != "$ACTIVE_BATCH_SENDER_ADDRESS" ]; then
  L2_ROLLUP_CONFIG_CHANGED=1
fi
if [ "$PREV_GENESIS_L2_TS" != "$L2_GENESIS_TS_HEX" ]; then
  L2_CHAIN_CONFIG_CHANGED=1
fi

if [ "$L2_CHAIN_CONFIG_CHANGED" -eq 1 ] || [ "$L2_ROLLUP_CONFIG_CHANGED" -eq 1 ]; then
  echo "Detected L2 config drift; reinitializing stale L2 state."
  hg_docker compose "${COMPOSE_ENV_ARGS[@]}" stop l2-geth op-node op-sequencer op-batcher op-proposer >/dev/null 2>&1 || true
  hg_docker compose "${COMPOSE_ENV_ARGS[@]}" rm -f l2-geth op-node op-sequencer op-batcher op-proposer >/dev/null 2>&1 || true

  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$OP_DIR/backups/l2-$ts"
  mkdir -p "$backup_dir"

  for data_dir in "$L2_DATA_DIR" "$OP_NODE_DATA_DIR" "$OP_SEQUENCER_DATA_DIR"; do
    if [ -d "$data_dir" ] && [ -n "$(find "$data_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      mv "$data_dir" "$backup_dir/$(basename "$data_dir")"
      mkdir -p "$data_dir"
      chmod 775 "$data_dir" || true
      echo "Backed up $data_dir to $backup_dir/$(basename "$data_dir")"
    fi
  done
fi

# Bring up the execution client first so we can record the genesis hash into rollup.json
# before starting op-node/op-sequencer (which validates the L2 genesis hash on boot).
hg_docker compose "${COMPOSE_ENV_ARGS[@]}" up -d l2-geth rpc-forward-l2-18547

echo "Waiting for L2 RPC..."
for i in $(seq 1 60); do
  if curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    echo "OK: $HOST_L2_RPC"
    break
  fi
  if hg_docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T l2-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$L2_CONTAINER_RPC" >/dev/null 2>&1; then
    echo "OK (container RPC): $L2_CONTAINER_RPC"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "L2 RPC not responding" >&2
    exit 1
  fi
done

echo "Recording L2 genesis hash into rollup config..."
L2_GENESIS_HASH=$(hg_docker compose "${COMPOSE_ENV_ARGS[@]}" exec -T l2-geth wget -qO- --header='content-type: application/json' --post-data='{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' "$L2_CONTAINER_RPC" | jq -r '.result.hash' || true)
if [ -z "$L2_GENESIS_HASH" ] || [ "$L2_GENESIS_HASH" = "null" ]; then
  L2_GENESIS_HASH=$(curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0", false]}' | jq -r '.result.hash' || true)
fi
if [ -n "$L2_GENESIS_HASH" ] && [ "$L2_GENESIS_HASH" != "null" ]; then
  tmp_rollup_l2_hash=$(mktemp)
  jq --arg hash "$L2_GENESIS_HASH" '.genesis.l2.hash = $hash' "$OP_DIR/config/rollup.json" >"$tmp_rollup_l2_hash" && mv "$tmp_rollup_l2_hash" "$OP_DIR/config/rollup.json"
  chmod 644 "$OP_DIR/config/rollup.json" || true
  echo "Set rollup genesis.l2.hash=$L2_GENESIS_HASH"

  (
    cd "$OP_DIR/config"
    sha256sum genesis-l2.json rollup.json > checksums.txt
  )
fi

# Start the rollup node + batcher only after rollup.json is pinned to the live genesis.
rollup_services=(op-node op-sequencer)
skip_services=()

if [ -z "$BATCHER_SKIP_REASON" ]; then
  rollup_services+=(op-batcher)
else
  echo "Skipping op-batcher: $BATCHER_SKIP_REASON"
  skip_services+=(op-batcher)
fi

if [ -z "$PROPOSER_SKIP_REASON" ]; then
  rollup_services+=(op-proposer)
else
  echo "Skipping op-proposer: $PROPOSER_SKIP_REASON"
  skip_services+=(op-proposer)
fi

if [ "${#skip_services[@]}" -gt 0 ]; then
  hg_docker compose "${COMPOSE_ENV_ARGS[@]}" rm -sf "${skip_services[@]}" >/dev/null 2>&1 || true
fi

hg_docker compose "${COMPOSE_ENV_ARGS[@]}" up -d --force-recreate "${rollup_services[@]}"

echo "Ensuring op-sequencer is active..."
for i in $(seq 1 60); do
  if rollup_sync_call "$OP_SEQUENCER_RPC" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "op-sequencer RPC not responding at $OP_SEQUENCER_RPC" >&2
    exit 1
  fi
done

SEQ_ACTIVE="$(rpc_call "$OP_SEQUENCER_RPC" "admin_sequencerActive" '[]' | jq -r '.result // empty' | tr '[:upper:]' '[:lower:]' || true)"
if [ "$SEQ_ACTIVE" != "true" ]; then
  SEQ_UNSAFE_HASH="$(rollup_sync_call "$OP_SEQUENCER_RPC" | jq -r '.result.unsafe_l2.hash // empty' || true)"
  if [ -z "$SEQ_UNSAFE_HASH" ] || [ "$SEQ_UNSAFE_HASH" = "null" ] || [ "$SEQ_UNSAFE_HASH" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    SEQ_UNSAFE_HASH="$(rpc_call "$HOST_L2_RPC" "eth_getBlockByNumber" '["latest", false]' | jq -r '.result.hash // empty' || true)"
  fi
  if [ -n "$SEQ_UNSAFE_HASH" ] && [ "$SEQ_UNSAFE_HASH" != "null" ]; then
    rpc_call "$OP_SEQUENCER_RPC" "admin_startSequencer" "[\"${SEQ_UNSAFE_HASH}\"]" >/dev/null
  fi
fi

SEQ_ACTIVE="$(rpc_call "$OP_SEQUENCER_RPC" "admin_sequencerActive" '[]' | jq -r '.result // empty' | tr '[:upper:]' '[:lower:]' || true)"
if [ "$SEQ_ACTIVE" != "true" ]; then
  echo "op-sequencer failed to enter active state" >&2
  exit 1
fi

echo "OP Stack L2 up (external L1). L1=$HOST_L1_RPC L2=$HOST_L2_RPC"
