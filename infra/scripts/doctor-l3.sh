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

# Prefer the canonical stack-level env if present (this repo is migrating to stack.env as source of truth).
# Do not echo secrets; this is only to populate addresses/flags consistently across scripts.
STACK_ENV_FILE="$ROOT_DIR/services/stack.env"
if [ -f "$STACK_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$STACK_ENV_FILE"
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

RELAYER_REQUIRE_L3_FINALITY_ON_L2="${RELAYER_REQUIRE_L3_FINALITY_ON_L2:-false}"
ROLLUP_GATING_L3_FINALITY_ON_L2="$(printf '%s' "$RELAYER_REQUIRE_L3_FINALITY_ON_L2" | tr '[:upper:]' '[:lower:]')"
L2_ROLLUP_L3_ADDRESS="${L2_ROLLUP_L3_ADDRESS:-}"
L3_ROLLUP_PROPOSER_HEALTH_URL="${L3_ROLLUP_PROPOSER_HEALTH_URL:-http://localhost:7272/health}"
L3_ROLLUP_PROGRESS_SAMPLE_SECONDS="${L3_ROLLUP_PROGRESS_SAMPLE_SECONDS:-15}"
L3_ROLLUP_PROGRESS_MIN_DELTA="${L3_ROLLUP_PROGRESS_MIN_DELTA:-1}"
L3_MAX_ROLLUP_LAG="${L3_MAX_ROLLUP_LAG:-512}"

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
L3_PROGRESS_SAMPLE_SECONDS="${L3_PROGRESS_SAMPLE_SECONDS:-15}"
L3_PROGRESS_MIN_DELTA="${L3_PROGRESS_MIN_DELTA:-1}"

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

rpc_block_number_dec() {
  local url="$1"
  local bn_hex
  bn_hex="$(json_result "$(jsonrpc "$url" eth_blockNumber || true)" || true)"
  if [ -z "$bn_hex" ]; then
    echo ""
    return 1
  fi
  hex_to_dec "$bn_hex"
}

rollup_proposer_health() {
  curl -fsS --max-time 4 "$L3_ROLLUP_PROPOSER_HEALTH_URL" 2>/dev/null || return 1
}

json_field() {
  python3 - <<'PY' "$1" "$2"
import json, sys
raw = sys.argv[1]
key = sys.argv[2]
if not raw:
    sys.exit(1)
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
cur = data
for part in key.split("."):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        cur = None
        break
if cur is None:
    print("")
elif isinstance(cur, bool):
    print("true" if cur else "false")
else:
    print(cur)
PY
}

require_rollup_progress() {
  local sleep_s="$1"
  local min_delta="$2"

  local a_raw b_raw a b delta
  a_raw="$(rollup_proposer_health || true)"
  a="$(json_field "$a_raw" "nextChildBlock" || true)"
  if [ -z "$a" ]; then
    fail "rollup proposer health missing nextChildBlock ($L3_ROLLUP_PROPOSER_HEALTH_URL)"
  fi
  sleep "$sleep_s"
  b_raw="$(rollup_proposer_health || true)"
  b="$(json_field "$b_raw" "nextChildBlock" || true)"
  if [ -z "$b" ]; then
    fail "rollup proposer health missing nextChildBlock (2nd sample) ($L3_ROLLUP_PROPOSER_HEALTH_URL)"
  fi
  # nextChildBlock is end+1
  if [ "$b" -lt "$a" ]; then
    fail "rollup proposer cursor regressed (sample1=$a sample2=$b)"
  fi
  delta=$((b - a))
  if [ "$delta" -lt "$min_delta" ]; then
    fail "no rollup proposer progress detected (sample1=$a sample2=$b delta=$delta over ${sleep_s}s)"
  fi
  echo "OK: rollup proposer progressing (nextChildBlock sample1=$a sample2=$b delta=$delta over ${sleep_s}s)"
}

require_execution_progress() {
  local url="$1"
  local sleep_s="$2"
  local min_delta="$3"

  local a b delta
  a="$(rpc_block_number_dec "$url" || true)"
  if [ -z "$a" ]; then
    fail "failed to fetch eth_blockNumber from $url"
  fi
  sleep "$sleep_s"
  b="$(rpc_block_number_dec "$url" || true)"
  if [ -z "$b" ]; then
    fail "failed to fetch eth_blockNumber from $url (2nd sample)"
  fi

  if [ "$b" -lt "$a" ]; then
    fail "L3 execution head regressed (sample1=$a sample2=$b)"
  fi
  delta=$((b - a))
  if [ "$delta" -lt "$min_delta" ]; then
    fail "no L3 execution progress detected (sample1=$a sample2=$b delta=$delta, expected >=$min_delta over ${sleep_s}s)"
  fi

  echo "OK: L3 execution progressing (sample1=$a sample2=$b delta=$delta over ${sleep_s}s)"
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

extract_port() {
  # Accepts either a raw port ("39545") or a URL ("http://localhost:39545").
  # Returns a numeric port or empty string if it can't be derived.
  local raw="$1"
  if [ -z "$raw" ]; then
    echo ""
    return 0
  fi
  if printf '%s' "$raw" | grep -Eq '^[0-9]+$'; then
    echo "$raw"
    return 0
  fi
  # shellcheck disable=SC2001
  printf '%s' "$raw" | sed -nE 's#^https?://[^:/]+:([0-9]+)(/.*)?$#\1#p'
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

L3_HOST_RPC_PORT="$(extract_port "${L3_HOST_RPC:-${HOST_L3_RPC:-39545}}")"
if [ -n "$L3_HOST_RPC_PORT" ] && ! port_listening "$L3_HOST_RPC_PORT"; then
  warn "L3 host RPC port not listening: ${L3_HOST_RPC_PORT} (url=${HOST_L3_RPC})"
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

if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
  require_execution_progress "$HOST_L3_RPC" "$L3_PROGRESS_SAMPLE_SECONDS" "$L3_PROGRESS_MIN_DELTA"
else
  l3_bn_dec="$(rpc_block_number_dec "$HOST_L3_RPC" || true)"
  if [ -n "$l3_bn_dec" ]; then
    echo "OK: L3 execution head (eth_blockNumber)=${l3_bn_dec} (progress check skipped: L3_REQUIRE_L3_PROGRESS=0)"
  else
    warn "failed to fetch eth_blockNumber from $HOST_L3_RPC"
  fi
fi

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
        # When finality is gated on the parent L2 via an OptimisticRollup contract, "safe" here is not the
        # same as "finalized on L2". In that mode we gate finality via the rollup proposer/contract instead.
        if [ "$ROLLUP_GATING_L3_FINALITY_ON_L2" = "true" ]; then
          warn "L3 safe lag high (unsafe=$SYNC_UNSAFE_L3_NUM safe=$SYNC_SAFE_L3_NUM lag=$SAFE_LAG > $L3_MAX_L3_SAFE_LAG) (ignored due to rollup finality gating)"
        else
          if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
            fail "L3 safe lag too high (unsafe=$SYNC_UNSAFE_L3_NUM safe=$SYNC_SAFE_L3_NUM lag=$SAFE_LAG > $L3_MAX_L3_SAFE_LAG)"
          else
            warn "L3 safe lag too high (unsafe=$SYNC_UNSAFE_L3_NUM safe=$SYNC_SAFE_L3_NUM lag=$SAFE_LAG > $L3_MAX_L3_SAFE_LAG)"
          fi
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
      # Some stacks report zeros for optimism_syncStatus while execution blocks are advancing.
      # For progress gating, we rely on eth_blockNumber delta (checked earlier).
      warn "optimism_syncStatus reports unsafe_l2=0; skipping derivation/safe-lag checks"
    fi
    echo "OK: derivation/safe-lag checks skipped (insufficient syncStatus data)"
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

if [ "$ROLLUP_GATING_L3_FINALITY_ON_L2" = "true" ]; then
  if [ -z "$L2_ROLLUP_L3_ADDRESS" ]; then
    if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
      fail "rollup gating enabled but L2_ROLLUP_L3_ADDRESS missing"
    else
      warn "rollup gating enabled but L2_ROLLUP_L3_ADDRESS missing"
    fi
  else
    # Use the rollup proposer (off-chain) as the primary source of truth for on-chain finality progress.
    # It already validates contract state and keeps an aligned cursor, so doctor checks can be lightweight.
    RH_RAW="$(rollup_proposer_health || true)"
    RH_OK="$(json_field "$RH_RAW" "ok" || true)"
    RH_OBSERVE_ONLY="$(json_field "$RH_RAW" "observeOnly" || true)"
    RH_NEXT="$(json_field "$RH_RAW" "nextChildBlock" || true)"
    if [ "$RH_OK" != "true" ] || [ -z "$RH_NEXT" ]; then
      if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
        fail "rollup proposer not reachable/healthy at $L3_ROLLUP_PROPOSER_HEALTH_URL"
      else
        warn "rollup proposer not reachable/healthy at $L3_ROLLUP_PROPOSER_HEALTH_URL"
      fi
    else
      if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ] && [ "$RH_OBSERVE_ONLY" = "true" ]; then
        fail "rollup proposer is observe-only (cannot propose/finalize batches) but rollup gating is enabled"
      fi

      L3_HEAD="$(rpc_block_number_dec "$HOST_L3_RPC" || true)"
      if [ -n "$L3_HEAD" ]; then
        # nextChildBlock is end+1; if it is 0, we treat end as -1 (no batches).
        if [ "$RH_NEXT" -gt 0 ]; then
          ROLLUP_END=$((RH_NEXT - 1))
        else
          ROLLUP_END=0
        fi
        ROLLUP_LAG=$((L3_HEAD - ROLLUP_END))
        if [ "$ROLLUP_LAG" -lt 0 ]; then ROLLUP_LAG=0; fi

        if [ "$ROLLUP_LAG" -gt "$L3_MAX_ROLLUP_LAG" ]; then
          if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
            fail "rollup finality lag too high (l3_head=$L3_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG > $L3_MAX_ROLLUP_LAG)"
          else
            warn "rollup finality lag too high (l3_head=$L3_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG > $L3_MAX_ROLLUP_LAG)"
          fi
        else
          echo "OK: rollup finality lag within threshold (l3_head=$L3_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG)"
        fi
      fi

      if [ "$L3_REQUIRE_L3_PROGRESS" = "1" ]; then
        require_rollup_progress "$L3_ROLLUP_PROGRESS_SAMPLE_SECONDS" "$L3_ROLLUP_PROGRESS_MIN_DELTA"
      else
        echo "OK: rollup proposer progress check skipped (L3_REQUIRE_L3_PROGRESS=0)"
      fi
    fi
  fi
fi

if [ "$AI_MONITOR_REQUIRED" = "1" ]; then
  if ! curl -fsS "$AI_MONITOR_URL" >/dev/null 2>&1; then
    fail "ai-monitor not reachable at $AI_MONITOR_URL"
  fi
  echo "OK: ai-monitor reachable"
fi

# Metrics (soft checks)
# NOTE: In this repo, L3 "finality on L2" is implemented via `ghost-rollup-proposer` (port 7272),
# not the OP Stack output proposer (default port 8302). If rollup gating is enabled, we treat 8302
# as optional and include the rollup proposer health endpoint instead.
metric_urls=( "$L3_GETH_METRICS_URL" "$L3_OP_NODE_METRICS_URL" "$L3_BATCHER_METRICS_URL" )
if [ "$ROLLUP_GATING_L3_FINALITY_ON_L2" = "true" ]; then
  metric_urls+=( "$L3_ROLLUP_PROPOSER_HEALTH_URL" )
else
  metric_urls+=( "$L3_PROPOSER_METRICS_URL" )
fi

for metric_url in "${metric_urls[@]}"; do
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

if [ "$ROLLUP_GATING_L3_FINALITY_ON_L2" = "true" ]; then
  if curl -fsS --max-time 4 "$L3_ROLLUP_PROPOSER_HEALTH_URL" >/dev/null 2>&1; then
    rh="$(rollup_proposer_health || true)"
    last_tick_ms="$(json_field "$rh" "metrics.lastTickFinishedAt" || true)"
    if [ -n "$last_tick_ms" ]; then
      now_ts="$(date +%s)"
      last_tick_ts="$(python3 - <<'PY' "$last_tick_ms"
import sys
try:
    print(int(int(sys.argv[1]) / 1000))
except Exception:
    print(0)
PY
)"
      if [ "$last_tick_ts" -gt 0 ]; then
        idle_secs=$(( now_ts - last_tick_ts ))
      else
        idle_secs=0
      fi
      if [ "$idle_secs" -gt "$L3_MAX_PROPOSER_IDLE_SECONDS" ]; then
        warn "rollup proposer idle for ${idle_secs}s (threshold ${L3_MAX_PROPOSER_IDLE_SECONDS}s)"
      fi
    fi
  fi
else
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
fi

echo "OK: L3 doctor checks completed"
