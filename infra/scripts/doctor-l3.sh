#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

L3_ENV_FILE="${L3_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l3}"
L3_SECRETS_FILE="${L3_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"

if [ -f "$L3_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L3_ENV_FILE"
  set +a
fi
if [ -f "$L3_SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L3_SECRETS_FILE"
  set +a
fi

L3_NAME="${L3_NAME:-ghostl3}"
L3_CHAIN_ID="${L3_CHAIN_ID:-903}"

L3_COMPOSE_FILE="${L3_COMPOSE_FILE:-$ROOT_DIR/infra/opstack/docker-compose.l3.yml}"
L3_CONFIG_DIR="${L3_CONFIG_DIR:-$ROOT_DIR/infra/opstack/l3/${L3_NAME}/config}"
L3_ROLLUP_JSON="${L3_ROLLUP_JSON:-$L3_CONFIG_DIR/rollup.json}"
L3_GENESIS_JSON="${L3_GENESIS_JSON:-$L3_CONFIG_DIR/genesis.json}"
L2_CHAIN_JSON="${L2_CHAIN_JSON:-$L3_CONFIG_DIR/l1-chain.json}"

HOST_L2_RPC="${HOST_L2_RPC:-${PARENT_L2_RPC:-http://localhost:29547}}"
HOST_L3_RPC="${HOST_L3_RPC:-${L3_RPC:-http://localhost:39545}}"
L3_ROLLUP_RPC="${L3_ROLLUP_RPC:-http://localhost:${L3_ROLLUP_RPC_HOST_PORT:-39546}}"

L3_GETH_METRICS_URL="${L3_GETH_METRICS_URL:-http://localhost:${L3_GETH_METRICS_HOST_PORT:-39606}/debug/metrics/prometheus}"
L3_OP_NODE_METRICS_URL="${L3_OP_NODE_METRICS_URL:-http://localhost:${L3_METRICS_NODE_HOST_PORT:-8300}/metrics}"
L3_BATCHER_METRICS_URL="${L3_BATCHER_METRICS_URL:-http://localhost:${L3_METRICS_BATCHER_HOST_PORT:-8301}/metrics}"
L3_PROPOSER_METRICS_URL="${L3_PROPOSER_METRICS_URL:-http://localhost:${L3_METRICS_PROPOSER_HOST_PORT:-8302}/metrics}"
L3_CHALLENGER_METRICS_URL="${L3_CHALLENGER_METRICS_URL:-http://localhost:${L3_CHALLENGER_METRICS_HOST_PORT:-8303}/metrics}"

AI_MONITOR_URL="${AI_MONITOR_URL:-http://localhost:7575/health}"
AI_MONITOR_REQUIRED="${AI_MONITOR_REQUIRED:-0}"

L3_SECRETS_SOURCE="${L3_SECRETS_SOURCE:-dev}"
L3_SECRETS_DIR="${L3_SECRETS_DIR:-$ROOT_DIR/infra/opstack/secrets}"
ALLOW_DEV_SECRETS="${ALLOW_DEV_SECRETS:-0}"
VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
VAULT_ROLE_ID="${VAULT_ROLE_ID:-}"
VAULT_SECRET_ID="${VAULT_SECRET_ID:-}"

L2_CHAIN_ID_EXPECTED="${PARENT_L2_CHAIN_ID:-}"
L3_CHAIN_ID_EXPECTED="${L3_CHAIN_ID:-}"

L3_MAX_PARENT_DERIVATION_LAG="${L3_MAX_PARENT_DERIVATION_LAG:-128}"
L3_MAX_L3_SAFE_LAG="${L3_MAX_L3_SAFE_LAG:-256}"
L3_MAX_PROPOSER_IDLE_SECONDS="${L3_MAX_PROPOSER_IDLE_SECONDS:-900}"
L3_MAX_BATCHER_IDLE_SECONDS="${L3_MAX_BATCHER_IDLE_SECONDS:-900}"
L3_REQUIRE_L3_PROGRESS="${L3_REQUIRE_L3_PROGRESS:-0}"

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }

need_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"
}

jsonrpc() {
  local url="$1"
  local method="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" || return 1
}

jsonrpc_params() {
  local url="$1"
  local method="$2"
  local params="$3"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}" || return 1
}

json_result() {
  python3 - <<'PY' "$1"
import json, sys
raw = sys.argv[1]
if not raw:
    sys.exit(1)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(1)
value = data.get("result", "")
if value is None:
    value = ""
print(value)
PY
}

json_result_field() {
  python3 - <<'PY' "$1" "$2"
import json, sys
raw = sys.argv[1]
field = sys.argv[2]
if not raw:
    sys.exit(1)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(1)
result = data.get("result", {})
if isinstance(result, dict):
    value = result.get(field, "")
else:
    value = ""
if value is None:
    value = ""
print(value)
PY
}

metric_value() {
  local url="$1"
  local metric="$2"
  curl -fsS --max-time 4 "$url" | awk -v m="$metric" '$1 == m {print $2; exit}'
}

metric_value_with_label() {
  local url="$1"
  local metric="$2"
  local label="$3"
  curl -fsS --max-time 4 "$url" | awk -v m="$metric" -v l="$label" '$1 ~ "^"m"\\{" && $1 ~ l {print $2; exit}'
}

to_int() {
  python3 - <<'PY' "$1"
import sys
raw = sys.argv[1]
try:
    print(int(float(raw)))
except Exception:
    print(0)
PY
}

hex_to_dec() {
  python3 - <<'PY' "$1"
import sys
raw = sys.argv[1].strip().lower()
if raw.startswith("0x"):
    print(int(raw, 16))
else:
    print(raw)
PY
}

read_json() {
  python3 - <<'PY' "$1" "$2"
import json, sys
path = sys.argv[1]
key = sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
for part in key.split("."):
    if isinstance(data, dict) and part in data:
        data = data[part]
    else:
        data = None
        break
print(data if data is not None else "")
PY
}

port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt "( sport = :$port )" 2>/dev/null | awk 'NR>1{found=1} END{exit found?0:1}'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk -v p=":$port" '$4 ~ p {found=1} END{exit found?0:1}'
  else
    return 1
  fi
}

echo "[doctor-l3] starting"

need_bin curl
need_bin sha256sum
need_bin python3

if ! command -v docker >/dev/null 2>&1; then
  fail "docker not installed"
fi
if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not reachable"
fi
if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose not available"
fi

echo "OK: docker/compose reachable"

if [ ! -f "$L3_ROLLUP_JSON" ]; then
  fail "missing rollup config: $L3_ROLLUP_JSON"
fi
if [ ! -f "$L3_GENESIS_JSON" ]; then
  fail "missing L3 genesis: $L3_GENESIS_JSON"
fi
if [ ! -f "$L2_CHAIN_JSON" ]; then
  fail "missing parent chain config: $L2_CHAIN_JSON"
fi

echo "OK: L3 config files present"

if [ "$L3_SECRETS_SOURCE" = "vault" ]; then
  if [ -z "$VAULT_ADDR" ] || { [ -z "$VAULT_TOKEN" ] && { [ -z "$VAULT_ROLE_ID" ] || [ -z "$VAULT_SECRET_ID" ]; }; }; then
    fail "Vault auth missing (set VAULT_ADDR and VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID)"
  fi
  for f in sequencer.key batcher.key proposer.key challenger.key jwtsecret; do
    if [ ! -f "$L3_SECRETS_DIR/$f" ]; then
      fail "Vault secret missing: $L3_SECRETS_DIR/$f"
    fi
  done
  echo "OK: Vault secrets present"
else
  if [ "$ALLOW_DEV_SECRETS" != "1" ]; then
    fail "Dev secrets blocked; set ALLOW_DEV_SECRETS=1 or use Vault"
  fi
  [ -n "${L3_SEQUENCER_KEY:-${SEQUENCER_KEY:-}}" ] || fail "SEQUENCER_KEY missing (set in .env.secrets)"
  [ -n "${L3_BATCHER_KEY:-${BATCHER_KEY:-}}" ] || fail "BATCHER_KEY missing (set in .env.secrets)"
  [ -n "${L3_PROPOSER_KEY:-${PROPOSER_KEY:-}}" ] || fail "PROPOSER_KEY missing (set in .env.secrets)"
  if [ -z "${L3_CHALLENGER_KEY:-${CHALLENGER_KEY:-}}" ]; then
    warn "CHALLENGER_KEY missing (set if challenger is enabled)"
  fi
  echo "OK: dev secrets allowed"
fi

if ! port_listening "${L3_HOST_RPC:-39545}"; then
  warn "L3 host RPC port not listening: ${L3_HOST_RPC:-39545}"
fi
if ! port_listening "${L3_ROLLUP_RPC_HOST_PORT:-39546}"; then
  warn "L3 rollup RPC port not listening: ${L3_ROLLUP_RPC_HOST_PORT:-39546}"
fi

L2_CHAIN_ID_HEX="$(json_result "$(jsonrpc "$HOST_L2_RPC" eth_chainId || true)")"
if [ -z "$L2_CHAIN_ID_HEX" ]; then
  fail "failed to reach parent L2 RPC at $HOST_L2_RPC"
fi
L2_CHAIN_ID_DEC="$(hex_to_dec "$L2_CHAIN_ID_HEX")"
if [ -n "$L2_CHAIN_ID_EXPECTED" ] && [ "$L2_CHAIN_ID_DEC" != "$L2_CHAIN_ID_EXPECTED" ]; then
  fail "parent L2 chain id mismatch: expected $L2_CHAIN_ID_EXPECTED, got $L2_CHAIN_ID_DEC"
fi

L3_CHAIN_ID_HEX="$(json_result "$(jsonrpc "$HOST_L3_RPC" eth_chainId || true)")"
if [ -z "$L3_CHAIN_ID_HEX" ]; then
  fail "failed to reach L3 RPC at $HOST_L3_RPC"
fi
L3_CHAIN_ID_DEC="$(hex_to_dec "$L3_CHAIN_ID_HEX")"
if [ -n "$L3_CHAIN_ID_EXPECTED" ] && [ "$L3_CHAIN_ID_DEC" != "$L3_CHAIN_ID_EXPECTED" ]; then
  fail "L3 chain id mismatch: expected $L3_CHAIN_ID_EXPECTED, got $L3_CHAIN_ID_DEC"
fi

ROLLUP_L2_CHAIN_ID="$(read_json "$L3_ROLLUP_JSON" l2_chain_id)"
ROLLUP_L1_CHAIN_ID="$(read_json "$L3_ROLLUP_JSON" l1_chain_id)"
if [ -n "$ROLLUP_L2_CHAIN_ID" ] && [ "$ROLLUP_L2_CHAIN_ID" != "$L3_CHAIN_ID_DEC" ]; then
  fail "rollup.json l2_chain_id mismatch: $ROLLUP_L2_CHAIN_ID (file) vs $L3_CHAIN_ID_DEC (RPC)"
fi
if [ -n "$ROLLUP_L1_CHAIN_ID" ] && [ "$ROLLUP_L1_CHAIN_ID" != "$L2_CHAIN_ID_DEC" ]; then
  fail "rollup.json l1_chain_id mismatch: $ROLLUP_L1_CHAIN_ID (file) vs $L2_CHAIN_ID_DEC (RPC)"
fi

echo "OK: chain IDs aligned"

if ! jsonrpc "$L3_ROLLUP_RPC" optimism_syncStatus >/dev/null 2>&1; then
  fail "op-node RPC not reachable at $L3_ROLLUP_RPC"
fi

echo "OK: rollup RPC reachable"

ROLLUP_L1_HASH="$(read_json "$L3_ROLLUP_JSON" genesis.l1.hash)"
ROLLUP_L1_NUM="$(read_json "$L3_ROLLUP_JSON" genesis.l1.number)"
ROLLUP_L2_HASH="$(read_json "$L3_ROLLUP_JSON" genesis.l2.hash)"
ROLLUP_L2_NUM="$(read_json "$L3_ROLLUP_JSON" genesis.l2.number)"

if [ -n "$ROLLUP_L1_HASH" ] && [ "$ROLLUP_L1_HASH" != "null" ]; then
  l1_num="${ROLLUP_L1_NUM:-0}"
  l1_hex="$(python3 - <<'PY' "$l1_num"
import sys
num = int(sys.argv[1]) if sys.argv[1] else 0
print(hex(num))
PY
)"
  L2_BLOCK_RAW="$(jsonrpc_params "$HOST_L2_RPC" "eth_getBlockByNumber" "[\"$l1_hex\", false]" || true)"
  L2_BLOCK_HASH="$(json_result_field "$L2_BLOCK_RAW" "hash" || true)"
  if [ -z "$L2_BLOCK_HASH" ]; then
    fail "failed to fetch parent L2 block $l1_num from $HOST_L2_RPC"
  fi
  if [ -n "$L2_BLOCK_HASH" ] && [ "$L2_BLOCK_HASH" != "$ROLLUP_L1_HASH" ]; then
    fail "rollup.json parent block hash mismatch (rollup=$ROLLUP_L1_HASH rpc=$L2_BLOCK_HASH)"
  fi
  echo "OK: rollup parent block hash matches"
else
  warn "rollup.json genesis.l1.hash not set"
fi

if [ -n "$ROLLUP_L2_HASH" ] && [ "$ROLLUP_L2_HASH" != "null" ]; then
  l2_num="${ROLLUP_L2_NUM:-0}"
  l2_hex="$(python3 - <<'PY' "$l2_num"
import sys
num = int(sys.argv[1]) if sys.argv[1] else 0
print(hex(num))
PY
)"
  L3_BLOCK_RAW="$(jsonrpc_params "$HOST_L3_RPC" "eth_getBlockByNumber" "[\"$l2_hex\", false]" || true)"
  L3_BLOCK_HASH="$(json_result_field "$L3_BLOCK_RAW" "hash" || true)"
  if [ -z "$L3_BLOCK_HASH" ]; then
    fail "failed to fetch L3 block $l2_num from $HOST_L3_RPC"
  fi
  if [ -n "$L3_BLOCK_HASH" ] && [ "$L3_BLOCK_HASH" != "$ROLLUP_L2_HASH" ]; then
    fail "rollup.json L3 block hash mismatch (rollup=$ROLLUP_L2_HASH rpc=$L3_BLOCK_HASH)"
  fi
  echo "OK: rollup L3 block hash matches"
else
  warn "rollup.json genesis.l2.hash not set"
fi

SYNC_RAW="$(jsonrpc "$L3_ROLLUP_RPC" "optimism_syncStatus" || true)"
SYNC_HEAD_L1_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("head_l1", {}).get("number", 0))
PY
)"
SYNC_CUR_L1_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("current_l1", {}).get("number", 0))
PY
)"
SYNC_SAFE_L3_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("safe_l2", {}).get("number", 0))
PY
)"
SYNC_UNSAFE_L3_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("unsafe_l2", {}).get("number", 0))
PY
)"

if [ "$SYNC_HEAD_L1_NUM" -gt 0 ]; then
  if [ "$SYNC_UNSAFE_L3_NUM" -gt 0 ]; then
    if [ "$SYNC_CUR_L1_NUM" -gt 0 ]; then
      L1_LAG=$((SYNC_HEAD_L1_NUM - SYNC_CUR_L1_NUM))
      if [ "$L1_LAG" -gt "$L3_MAX_PARENT_DERIVATION_LAG" ]; then
        if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
          fail "parent derivation lag too high (head=$SYNC_HEAD_L1_NUM current=$SYNC_CUR_L1_NUM lag=$L1_LAG > $L3_MAX_PARENT_DERIVATION_LAG)"
        else
          warn "parent derivation lag too high (head=$SYNC_HEAD_L1_NUM current=$SYNC_CUR_L1_NUM lag=$L1_LAG > $L3_MAX_PARENT_DERIVATION_LAG)"
        fi
      else
        echo "OK: parent derivation lag within threshold"
      fi
    else
      if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
        warn "current_l1 is zero; op-node has not derived parent L2 yet"
      else
        echo "OK: parent derivation lag check skipped (L3_REQUIRE_L3_PROGRESS=0)"
      fi
    fi
    if [ "$SYNC_SAFE_L3_NUM" -gt 0 ]; then
      SAFE_LAG=$((SYNC_UNSAFE_L3_NUM - SYNC_SAFE_L3_NUM))
      if [ "$SAFE_LAG" -gt "$L3_MAX_L3_SAFE_LAG" ]; then
        if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
          fail "L3 safe lag too high (unsafe=$SYNC_UNSAFE_L3_NUM safe=$SYNC_SAFE_L3_NUM lag=$SAFE_LAG > $L3_MAX_L3_SAFE_LAG)"
        else
          warn "L3 safe lag too high (unsafe=$SYNC_UNSAFE_L3_NUM safe=$SYNC_SAFE_L3_NUM lag=$SAFE_LAG > $L3_MAX_L3_SAFE_LAG)"
        fi
      else
        echo "OK: L3 safe lag within threshold"
      fi
    else
      if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
        warn "safe_l2 is zero; no safe L3 blocks observed yet"
      else
        echo "OK: L3 safe lag check skipped (L3_REQUIRE_L3_PROGRESS=0)"
      fi
    fi
  else
    if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
      fail "L3 unsafe head is zero; no L3 progress detected"
    fi
    echo "OK: L3 progress check skipped (L3_REQUIRE_L3_PROGRESS=0)"
  fi
fi

if [ -n "${L3_PORTAL_ADDRESS:-}" ]; then
  portal_code="$(json_result "$(jsonrpc_params "$HOST_L2_RPC" eth_getCode "[\"$L3_PORTAL_ADDRESS\",\"latest\"]" || true)")"
  if [ -z "$portal_code" ] || [ "$portal_code" = "0x" ]; then
    fail "L3 portal address has no bytecode on parent L2: $L3_PORTAL_ADDRESS"
  fi
else
  fail "L3_PORTAL_ADDRESS missing"
fi

if [ -n "${L3_SYSTEM_CONFIG_ADDRESS:-}" ]; then
  system_code="$(json_result "$(jsonrpc_params "$HOST_L2_RPC" eth_getCode "[\"$L3_SYSTEM_CONFIG_ADDRESS\",\"latest\"]" || true)")"
  if [ -z "$system_code" ] || [ "$system_code" = "0x" ]; then
    fail "L3 SystemConfig has no bytecode on parent L2: $L3_SYSTEM_CONFIG_ADDRESS"
  fi
else
  fail "L3_SYSTEM_CONFIG_ADDRESS missing"
fi

if [ -n "${L3_L2OO_ADDRESS:-}" ]; then
  l2oo_code="$(json_result "$(jsonrpc_params "$HOST_L2_RPC" eth_getCode "[\"$L3_L2OO_ADDRESS\",\"latest\"]" || true)")"
  if [ -z "$l2oo_code" ] || [ "$l2oo_code" = "0x" ]; then
    warn "L3 L2OO address has no bytecode on parent L2: $L3_L2OO_ADDRESS"
  fi
else
  warn "L3_L2OO_ADDRESS missing"
fi

if [ -n "${L3_DISPUTE_GAME_FACTORY_ADDRESS:-}" ]; then
  dgf_code="$(json_result "$(jsonrpc_params "$HOST_L2_RPC" eth_getCode "[\"$L3_DISPUTE_GAME_FACTORY_ADDRESS\",\"latest\"]" || true)")"
  if [ -z "$dgf_code" ] || [ "$dgf_code" = "0x" ]; then
    warn "L3 DisputeGameFactory has no bytecode on parent L2: $L3_DISPUTE_GAME_FACTORY_ADDRESS"
  fi
else
  warn "L3_DISPUTE_GAME_FACTORY_ADDRESS missing"
fi

batch_inbox_from_rollup="$(read_json "$L3_ROLLUP_JSON" batch_inbox_address)"
if [ -n "${BATCH_INBOX_ADDRESS:-}" ] && [ -n "$batch_inbox_from_rollup" ] && [ "${BATCH_INBOX_ADDRESS,,}" != "${batch_inbox_from_rollup,,}" ]; then
  warn "BATCH_INBOX_ADDRESS differs from rollup.json batch_inbox_address"
fi

echo "OK: parent L2 contract bytecode checks passed"

if [ "$AI_MONITOR_REQUIRED" = "1" ]; then
  if ! curl -fsS "$AI_MONITOR_URL" >/dev/null 2>&1; then
    fail "ai-monitor not reachable at $AI_MONITOR_URL"
  fi
  echo "OK: ai-monitor reachable"
fi

# Metrics (soft checks)
for metric_url in "$L3_GETH_METRICS_URL" "$L3_OP_NODE_METRICS_URL" "$L3_BATCHER_METRICS_URL" "$L3_PROPOSER_METRICS_URL"; do
  if ! curl -fsS --max-time 4 "$metric_url" >/dev/null 2>&1; then
    warn "metrics endpoint not reachable: $metric_url"
  fi
done

# Activity checks (soft by default)
if curl -fsS --max-time 4 "$L3_BATCHER_METRICS_URL" >/dev/null 2>&1; then
  batcher_idle="$(metric_value "$L3_BATCHER_METRICS_URL" op_batcher_last_batch_timestamp 2>/dev/null || true)"
  if [ -n "$batcher_idle" ]; then
    now_ts="$(date +%s)"
    idle_secs=$(( now_ts - ${batcher_idle%.*} ))
    if [ "$idle_secs" -gt "$L3_MAX_BATCHER_IDLE_SECONDS" ]; then
      warn "batcher idle for ${idle_secs}s (threshold ${L3_MAX_BATCHER_IDLE_SECONDS}s)"
    fi
  fi
fi

if curl -fsS --max-time 4 "$L3_PROPOSER_METRICS_URL" >/dev/null 2>&1; then
  proposer_idle="$(metric_value "$L3_PROPOSER_METRICS_URL" op_proposer_last_submitted_output_timestamp 2>/dev/null || true)"
  if [ -n "$proposer_idle" ]; then
    now_ts="$(date +%s)"
    idle_secs=$(( now_ts - ${proposer_idle%.*} ))
    if [ "$idle_secs" -gt "$L3_MAX_PROPOSER_IDLE_SECONDS" ]; then
      warn "proposer idle for ${idle_secs}s (threshold ${L3_MAX_PROPOSER_IDLE_SECONDS}s)"
    fi
  fi
fi

if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
  l3_block_hex="$(json_result "$(jsonrpc "$HOST_L3_RPC" eth_blockNumber || true)")"
  l3_block_dec="$(hex_to_dec "$l3_block_hex")"
  if [ "$l3_block_dec" -le 0 ]; then
    fail "L3 unsafe head is zero; no L3 progress detected yet"
  fi
fi

echo "OK: L3 doctor checks completed"
