#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

L2_ENV_FILE="${L2_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l2}"
L2_SECRETS_FILE="${L2_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"

if [ -f "$L2_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L2_ENV_FILE"
  set +a
fi
if [ -f "$L2_SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L2_SECRETS_FILE"
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

L2_COMPOSE_FILE="${L2_COMPOSE_FILE:-$ROOT_DIR/infra/opstack/docker-compose.yml}"
L2_CONFIG_DIR="${L2_CONFIG_DIR:-$ROOT_DIR/infra/opstack/config}"
L2_ROLLUP_JSON="${L2_ROLLUP_JSON:-$L2_CONFIG_DIR/rollup.json}"
L2_GENESIS_JSON="${L2_GENESIS_JSON:-$L2_CONFIG_DIR/genesis-l2.json}"
L1_CHAIN_JSON="${L1_CHAIN_JSON:-$L2_CONFIG_DIR/l1-chain.json}"
L2_CHECKSUMS_FILE="${L2_CHECKSUMS_FILE:-$L2_CONFIG_DIR/checksums.txt}"
if [ -z "${L1_DEPLOYMENTS_JSON:-}" ]; then
  if [ -f "$L2_CONFIG_DIR/l1-deployments.custom.json" ]; then
    L1_DEPLOYMENTS_JSON="$L2_CONFIG_DIR/l1-deployments.custom.json"
  else
    L1_DEPLOYMENTS_JSON="$L2_CONFIG_DIR/l1-deployments.json"
  fi
fi
L2_DEPLOYMENTS_JSON="${L2_DEPLOYMENTS_JSON:-$L2_CONFIG_DIR/l2-deployments.json}"

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
OP_NODE_RPC="${OP_NODE_RPC:-http://localhost:9546}"
OP_SEQUENCER_RPC="${OP_SEQUENCER_RPC:-http://localhost:9646}"

L2_GETH_METRICS_URL="${L2_GETH_METRICS_URL:-http://localhost:29606/debug/metrics/prometheus}"
OP_NODE_METRICS_URL="${OP_NODE_METRICS_URL:-http://localhost:7300/metrics}"
OP_SEQUENCER_METRICS_URL="${OP_SEQUENCER_METRICS_URL:-http://localhost:7303/metrics}"
OP_BATCHER_METRICS_URL="${OP_BATCHER_METRICS_URL:-http://localhost:7301/metrics}"
OP_PROPOSER_METRICS_URL="${OP_PROPOSER_METRICS_URL:-http://localhost:7302/metrics}"
L2_CHALLENGER_METRICS_URL="${L2_CHALLENGER_METRICS_URL:-http://localhost:${L2_CHALLENGER_METRICS_HOST_PORT:-7303}/metrics}"
AI_MONITOR_URL="${AI_MONITOR_URL:-http://localhost:7575/health}"
AI_MONITOR_REQUIRED="${AI_MONITOR_REQUIRED:-0}"
AI_MONITOR_OBSERVE_ONLY="${AI_MONITOR_OBSERVE_ONLY:-1}"
POLICY_REGISTRY_ADDRESS="${POLICY_REGISTRY_ADDRESS:-}"
POLICY_REGISTRY_RPC="${POLICY_REGISTRY_RPC:-$HOST_L1_RPC}"
POLICY_REQUIRED="${POLICY_REQUIRED:-1}"

RELAYER_REQUIRE_L2_FINALITY_ON_L1="${RELAYER_REQUIRE_L2_FINALITY_ON_L1:-false}"
ROLLUP_GATING_L2_FINALITY_ON_L1="$(printf '%s' "$RELAYER_REQUIRE_L2_FINALITY_ON_L1" | tr '[:upper:]' '[:lower:]')"
L1_ROLLUP_L2_ADDRESS="${L1_ROLLUP_L2_ADDRESS:-}"
L2_ROLLUP_PROPOSER_HEALTH_URL="${L2_ROLLUP_PROPOSER_HEALTH_URL:-}"
L2_ROLLUP_PROGRESS_SAMPLE_SECONDS="${L2_ROLLUP_PROGRESS_SAMPLE_SECONDS:-15}"
L2_ROLLUP_PROGRESS_MIN_DELTA="${L2_ROLLUP_PROGRESS_MIN_DELTA:-1}"
L2_MAX_ROLLUP_LAG="${L2_MAX_ROLLUP_LAG:-512}"

L2_MAX_L1_DERIVATION_LAG="${L2_MAX_L1_DERIVATION_LAG:-128}"
L2_MAX_L2_SAFE_LAG="${L2_MAX_L2_SAFE_LAG:-256}"
L2_MAX_PROPOSER_IDLE_SECONDS="${L2_MAX_PROPOSER_IDLE_SECONDS:-900}"
L2_MAX_BATCHER_IDLE_SECONDS="${L2_MAX_BATCHER_IDLE_SECONDS:-900}"
L2_REQUIRE_L2_PROGRESS="${L2_REQUIRE_L2_PROGRESS:-0}"
L2_REQUIRE_BRIDGE_WIRING="${L2_REQUIRE_BRIDGE_WIRING:-0}"
L2_PROGRESS_SAMPLE_SECONDS="${L2_PROGRESS_SAMPLE_SECONDS:-15}"
L2_PROGRESS_MIN_DELTA="${L2_PROGRESS_MIN_DELTA:-1}"

L2_SECRETS_SOURCE="${L2_SECRETS_SOURCE:-dev}"
L2_SECRETS_DIR="${L2_SECRETS_DIR:-$ROOT_DIR/infra/opstack/secrets}"
ALLOW_DEV_SECRETS="${ALLOW_DEV_SECRETS:-0}"
VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
VAULT_ROLE_ID="${VAULT_ROLE_ID:-}"
VAULT_SECRET_ID="${VAULT_SECRET_ID:-}"

L1_CHAIN_ID_EXPECTED="${L1_CHAIN_ID:-}"
L2_CHAIN_ID_EXPECTED="${L2_CHAIN_ID:-}"
CHALLENGER_REQUIRED="${CHALLENGER_REQUIRED:-0}"
L2_DOCTOR_SKIP_RUNTIME="${L2_DOCTOR_SKIP_RUNTIME:-0}"
L2_DOCTOR_SKIP_DOCKER="${L2_DOCTOR_SKIP_DOCKER:-0}"

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }

STRICT_MODE=0
if [ "${SLITHER_STRICT:-0}" = "1" ] || [ -n "${CI:-}" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  STRICT_MODE=1
fi

skip_or_fail() {
  local message="$1"
  if [ "$STRICT_MODE" = "1" ]; then
    fail "$message"
  fi
  warn "SKIPPED: $message"
  echo "[doctor-l2] SKIPPED: $message"
  exit 0
}

need_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"
}

is_docker_daemon_unavailable() {
  local msg="${1:-}"
  msg="$(printf '%s' "$msg" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *"permission denied while trying to connect to the docker api"* ) return 0 ;;
    *"permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"got permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"cannot connect to the docker daemon"* ) return 0 ;;
    *"is the docker daemon running"* ) return 0 ;;
    *"error during connect"*docker.sock* ) return 0 ;;
    *dial\ unix*docker.sock*permission\ denied* ) return 0 ;;
    *dial\ unix*docker.sock*operation\ not\ permitted* ) return 0 ;;
    *dial\ unix*docker.sock*no\ such\ file\ or\ directory* ) return 0 ;;
    *) return 1 ;;
  esac
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

abi_decode_address() {
  local word="$1"
  if [ -z "$word" ] || [ "$word" = "null" ] || [ "$word" = "0x" ]; then
    echo ""
    return 1
  fi
  word="${word#0x}"
  if [ "${#word}" -lt 40 ]; then
    echo ""
    return 1
  fi
  echo "0x${word: -40}"
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
  if [ -z "$L2_ROLLUP_PROPOSER_HEALTH_URL" ]; then
    return 1
  fi
  curl -fsS --max-time 4 "$L2_ROLLUP_PROPOSER_HEALTH_URL" 2>/dev/null || return 1
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
    fail "rollup proposer health missing nextChildBlock ($L2_ROLLUP_PROPOSER_HEALTH_URL)"
  fi
  sleep "$sleep_s"
  b_raw="$(rollup_proposer_health || true)"
  b="$(json_field "$b_raw" "nextChildBlock" || true)"
  if [ -z "$b" ]; then
    fail "rollup proposer health missing nextChildBlock (2nd sample) ($L2_ROLLUP_PROPOSER_HEALTH_URL)"
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
    fail "L2 execution head regressed (sample1=$a sample2=$b)"
  fi
  delta=$((b - a))
  if [ "$delta" -lt "$min_delta" ]; then
    fail "no L2 execution progress detected (sample1=$a sample2=$b delta=$delta, expected >=$min_delta over ${sleep_s}s)"
  fi

  echo "OK: L2 execution progressing (sample1=$a sample2=$b delta=$delta over ${sleep_s}s)"
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

echo "[doctor-l2] starting"

need_bin curl
need_bin sha256sum
need_bin python3

DOCKER_AVAILABLE=1
if ! command -v docker >/dev/null 2>&1; then
  if [ "$L2_DOCTOR_SKIP_DOCKER" = "1" ]; then
    DOCKER_AVAILABLE=0
    warn "docker not installed (L2_DOCTOR_SKIP_DOCKER=1)"
  else
    skip_or_fail "docker not installed"
  fi
fi
if [ "$DOCKER_AVAILABLE" = "1" ] && [ "$L2_DOCTOR_SKIP_DOCKER" != "1" ]; then
  docker_out=""
  if ! docker_out="$(docker version --format '{{.Server.Version}}' 2>&1)"; then
    if is_docker_daemon_unavailable "$docker_out"; then
      if [ "$L2_DOCTOR_SKIP_DOCKER" = "1" ]; then
        DOCKER_AVAILABLE=0
        warn "docker daemon/socket not reachable (L2_DOCTOR_SKIP_DOCKER=1)"
      else
        skip_or_fail "docker daemon/socket not reachable"
      fi
    else
      skip_or_fail "docker version failed"
    fi
  fi
elif [ "$L2_DOCTOR_SKIP_DOCKER" = "1" ]; then
  DOCKER_AVAILABLE=0
  warn "docker daemon check skipped (L2_DOCTOR_SKIP_DOCKER=1)"
fi

COMPOSE_AVAILABLE=0
if [ "$DOCKER_AVAILABLE" = "1" ] && docker compose version >/dev/null 2>&1; then
  COMPOSE_AVAILABLE=1
elif [ "$L2_DOCTOR_SKIP_DOCKER" != "1" ]; then
  fail "docker compose not available"
fi
if [ "$DOCKER_AVAILABLE" = "1" ] && [ "$COMPOSE_AVAILABLE" = "1" ]; then
  echo "OK: docker/compose reachable"
else
  warn "docker/compose unavailable; docker-dependent checks will be skipped"
fi

if [ "$AI_MONITOR_OBSERVE_ONLY" != "1" ] && [ "$POLICY_REQUIRED" = "1" ]; then
  if [ -z "$POLICY_REGISTRY_ADDRESS" ]; then
    fail "policy registry required for autonomous actions (set POLICY_REGISTRY_ADDRESS)"
  fi
  if [ -z "$POLICY_REGISTRY_RPC" ]; then
    fail "policy registry RPC missing (set POLICY_REGISTRY_RPC or HOST_L1_RPC)"
  fi
  echo "OK: policy registry configured for autonomous actions"
fi

if [ "$L2_SECRETS_SOURCE" = "vault" ]; then
  if [ -z "$VAULT_ADDR" ] || { [ -z "$VAULT_TOKEN" ] && { [ -z "$VAULT_ROLE_ID" ] || [ -z "$VAULT_SECRET_ID" ]; }; }; then
    fail "Vault auth missing (set VAULT_ADDR and VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID)"
  fi
  for f in sequencer.key batcher.key proposer.key challenger.key jwtsecret; do
    if [ ! -f "$L2_SECRETS_DIR/$f" ]; then
      fail "Vault secret missing: $L2_SECRETS_DIR/$f"
    fi
  done
  echo "OK: Vault secrets present"
else
  if [ "$ALLOW_DEV_SECRETS" != "1" ]; then
    fail "Dev secrets blocked; set ALLOW_DEV_SECRETS=1 or use Vault"
  fi
  [ -n "${SEQUENCER_KEY:-}" ] || fail "SEQUENCER_KEY missing (set in .env.secrets)"
  [ -n "${BATCHER_KEY:-}" ] || fail "BATCHER_KEY missing (set in .env.secrets)"
  [ -n "${PROPOSER_KEY:-}" ] || fail "PROPOSER_KEY missing (set in .env.secrets)"
  if [ -z "${CHALLENGER_KEY:-}" ]; then
    warn "CHALLENGER_KEY missing (set if challenger is enabled)"
  fi
  echo "OK: dev secrets allowed"
fi

[ -f "$L2_COMPOSE_FILE" ] || fail "missing L2 compose file: $L2_COMPOSE_FILE"
[ -f "$L2_ROLLUP_JSON" ] || fail "missing rollup config: $L2_ROLLUP_JSON"
[ -f "$L2_GENESIS_JSON" ] || fail "missing L2 genesis: $L2_GENESIS_JSON"
[ -f "$L1_CHAIN_JSON" ] || fail "missing L1 chain config: $L1_CHAIN_JSON"
[ -f "$L2_CHECKSUMS_FILE" ] || fail "missing checksums file: $L2_CHECKSUMS_FILE"

if ! (cd "$L2_CONFIG_DIR" && sha256sum -c "$(basename "$L2_CHECKSUMS_FILE")" >/dev/null 2>&1); then
  fail "config checksum mismatch in $L2_CONFIG_DIR"
fi

echo "OK: rollup/genesis checksums verified"

if [ "$COMPOSE_AVAILABLE" = "1" ]; then
  if ! docker compose -f "$L2_COMPOSE_FILE" config >/dev/null 2>&1; then
    fail "compose config invalid for $L2_COMPOSE_FILE"
  fi
  echo "OK: compose config valid"
else
  warn "compose config validation skipped (docker compose unavailable)"
fi

L2_GENESIS_CHAIN_ID="$(read_json "$L2_GENESIS_JSON" "config.chainId")"
if [ -n "$L2_CHAIN_ID_EXPECTED" ] && [ "$L2_GENESIS_CHAIN_ID" != "$L2_CHAIN_ID_EXPECTED" ]; then
  fail "L2 genesis chainId=$L2_GENESIS_CHAIN_ID does not match expected=$L2_CHAIN_ID_EXPECTED"
fi

echo "OK: L2 genesis chainId=${L2_GENESIS_CHAIN_ID:-unknown}"

if [ "$L2_DOCTOR_SKIP_RUNTIME" = "1" ]; then
  warn "runtime checks skipped (L2_DOCTOR_SKIP_RUNTIME=1)"
  echo "[doctor-l2] OK (runtime checks skipped)"
  exit 0
fi

if jsonrpc "$HOST_L2_RPC" "eth_chainId" >/tmp/doctor-l2-chainid.json 2>/dev/null; then
  RPC_CHAIN_ID_HEX="$(python3 - <<'PY' /tmp/doctor-l2-chainid.json
import json, sys
print(json.load(open(sys.argv[1])).get("result", ""))
PY
)"
  RPC_CHAIN_ID_DEC="$(hex_to_dec "${RPC_CHAIN_ID_HEX:-0}")"
  if [ -n "$L2_CHAIN_ID_EXPECTED" ] && [ "$RPC_CHAIN_ID_DEC" != "$L2_CHAIN_ID_EXPECTED" ]; then
    fail "L2 RPC chainId=$RPC_CHAIN_ID_DEC does not match expected=$L2_CHAIN_ID_EXPECTED"
  fi
  echo "OK: L2 RPC chainId=${RPC_CHAIN_ID_DEC:-unknown}"
else
  fail "L2 RPC not reachable at $HOST_L2_RPC"
fi

if jsonrpc "$HOST_L1_RPC" "eth_chainId" >/tmp/doctor-l1-chainid.json 2>/dev/null; then
  L1_RPC_CHAIN_ID_HEX="$(python3 - <<'PY' /tmp/doctor-l1-chainid.json
import json, sys
print(json.load(open(sys.argv[1])).get("result", ""))
PY
)"
  L1_RPC_CHAIN_ID_DEC="$(hex_to_dec "${L1_RPC_CHAIN_ID_HEX:-0}")"
  if [ -n "$L1_CHAIN_ID_EXPECTED" ] && [ "$L1_RPC_CHAIN_ID_DEC" != "$L1_CHAIN_ID_EXPECTED" ]; then
    fail "L1 RPC chainId=$L1_RPC_CHAIN_ID_DEC does not match expected=$L1_CHAIN_ID_EXPECTED"
  fi
  echo "OK: L1 RPC chainId=${L1_RPC_CHAIN_ID_DEC:-unknown}"
else
  fail "L1 RPC not reachable at $HOST_L1_RPC"
fi

if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
  require_execution_progress "$HOST_L2_RPC" "$L2_PROGRESS_SAMPLE_SECONDS" "$L2_PROGRESS_MIN_DELTA"
else
  l2_bn_dec="$(rpc_block_number_dec "$HOST_L2_RPC" || true)"
  if [ -n "$l2_bn_dec" ]; then
    echo "OK: L2 execution head (eth_blockNumber)=${l2_bn_dec} (progress check skipped: L2_REQUIRE_L2_PROGRESS=0)"
  else
    warn "failed to fetch eth_blockNumber from $HOST_L2_RPC"
  fi
fi

ROLLUP_L1_HASH="$(read_json "$L2_ROLLUP_JSON" "genesis.l1.hash")"
ROLLUP_L1_NUM="$(read_json "$L2_ROLLUP_JSON" "genesis.l1.number")"
ROLLUP_L2_HASH="$(read_json "$L2_ROLLUP_JSON" "genesis.l2.hash")"
if [ -n "$ROLLUP_L1_HASH" ] && [ "$ROLLUP_L1_HASH" != "null" ]; then
  l1_num="${ROLLUP_L1_NUM:-0}"
  l1_hex="$(python3 - <<'PY' "$l1_num"
import sys
num = int(sys.argv[1]) if sys.argv[1] else 0
print(hex(num))
PY
)"
  L1_BLOCK_RAW="$(jsonrpc_params "$HOST_L1_RPC" "eth_getBlockByNumber" "[\"$l1_hex\", false]" || true)"
  L1_BLOCK_HASH="$(json_result_field "$L1_BLOCK_RAW" "hash" || true)"
  if [ -z "$L1_BLOCK_HASH" ]; then
    fail "failed to fetch L1 origin block ${l1_num} from $HOST_L1_RPC"
  fi
  if [ -n "$L1_BLOCK_HASH" ] && [ "$L1_BLOCK_HASH" != "$ROLLUP_L1_HASH" ]; then
    fail "rollup.json L1 origin hash mismatch at block ${l1_num} (rollup=$ROLLUP_L1_HASH rpc=$L1_BLOCK_HASH)"
  fi
  echo "OK: rollup L1 origin hash matches"
else
  warn "rollup.json genesis.l1.hash not set"
fi

if [ -n "$ROLLUP_L2_HASH" ] && [ "$ROLLUP_L2_HASH" != "null" ]; then
  L2_BLOCK0_RAW="$(jsonrpc_params "$HOST_L2_RPC" "eth_getBlockByNumber" '["0x0", false]' || true)"
  L2_BLOCK0_HASH="$(json_result_field "$L2_BLOCK0_RAW" "hash" || true)"
  if [ -z "$L2_BLOCK0_HASH" ]; then
    fail "failed to fetch L2 genesis block from $HOST_L2_RPC"
  fi
  if [ -n "$L2_BLOCK0_HASH" ] && [ "$L2_BLOCK0_HASH" != "$ROLLUP_L2_HASH" ]; then
    fail "rollup.json L2 genesis hash mismatch (rollup=$ROLLUP_L2_HASH rpc=$L2_BLOCK0_HASH)"
  fi
  echo "OK: rollup L2 genesis hash matches"
else
  warn "rollup.json genesis.l2.hash not set"
fi

if ! jsonrpc "$OP_NODE_RPC" "optimism_syncStatus" >/dev/null 2>&1; then
  fail "op-node RPC not reachable at $OP_NODE_RPC"
fi
if ! jsonrpc "$OP_SEQUENCER_RPC" "optimism_syncStatus" >/dev/null 2>&1; then
  fail "op-sequencer RPC not reachable at $OP_SEQUENCER_RPC"
fi

echo "OK: op-node/op-sequencer RPC reachable"

SYNC_RAW="$(jsonrpc "$OP_NODE_RPC" "optimism_syncStatus" || true)"
SEQ_SYNC_RAW="$(jsonrpc "$OP_SEQUENCER_RPC" "optimism_syncStatus" || true)"

# If the sequencer is stopped, L2 can accept txs into the txpool but will not produce new blocks.
# This breaks E2E bridging and any progress-gated environments.
SEQ_ACTIVE_RAW="$(jsonrpc "$OP_SEQUENCER_RPC" "admin_sequencerActive" || true)"
SEQ_ACTIVE_VAL="$(json_result "$SEQ_ACTIVE_RAW" || true)"
# json_result prints python booleans as "True"/"False"; normalize for bash checks.
SEQ_ACTIVE_VAL="$(printf '%s' "$SEQ_ACTIVE_VAL" | tr '[:upper:]' '[:lower:]')"
if [ "$SEQ_ACTIVE_VAL" = "true" ]; then
  echo "OK: op-sequencer active"
elif [ "$SEQ_ACTIVE_VAL" = "false" ]; then
  SEQ_UNSAFE_HASH="$(python3 - <<'PY' "$SEQ_SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("unsafe_l2", {}).get("hash", ""))
PY
)"
  warn "op-sequencer is STOPPED (admin_sequencerActive=false)"
  warn "Start it with (unsafe head hash): ${SEQ_UNSAFE_HASH:-<unknown>}"
  warn "curl -fsS -X POST \"$OP_SEQUENCER_RPC\" -H 'content-type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"admin_startSequencer\",\"params\":[\"${SEQ_UNSAFE_HASH:-0x0000000000000000000000000000000000000000000000000000000000000000}\"]}'"
  fail "sequencer stopped"
else
  warn "admin_sequencerActive unavailable on op-sequencer RPC; cannot assert sequencer is running"
fi

SYNC_HEAD_L1="$(json_result_field "$SYNC_RAW" "head_l1" || true)"
SYNC_CUR_L1="$(json_result_field "$SYNC_RAW" "current_l1" || true)"
SYNC_SAFE_L2="$(json_result_field "$SYNC_RAW" "safe_l2" || true)"
SYNC_UNSAFE_L2="$(json_result_field "$SYNC_RAW" "unsafe_l2" || true)"

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
SYNC_SAFE_L2_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("safe_l2", {}).get("number", 0))
PY
)"
SYNC_UNSAFE_L2_NUM="$(python3 - <<'PY' "$SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("unsafe_l2", {}).get("number", 0))
PY
)"

SEQ_CROSS_UNSAFE_L2_NUM="$(python3 - <<'PY' "$SEQ_SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("cross_unsafe_l2", {}).get("number", 0))
PY
)"

SEQ_UNSAFE_L2_NUM="$(python3 - <<'PY' "$SEQ_SYNC_RAW"
import json, sys
raw = sys.argv[1]
data = json.loads(raw).get("result", {}) if raw else {}
print(data.get("unsafe_l2", {}).get("number", 0))
PY
)"

EFFECTIVE_UNSAFE_L2_NUM="$SYNC_UNSAFE_L2_NUM"
if [ "$EFFECTIVE_UNSAFE_L2_NUM" -eq 0 ] && [ "$SEQ_UNSAFE_L2_NUM" -gt 0 ]; then
  EFFECTIVE_UNSAFE_L2_NUM="$SEQ_UNSAFE_L2_NUM"
fi
if [ "$EFFECTIVE_UNSAFE_L2_NUM" -eq 0 ] && [ "$SEQ_CROSS_UNSAFE_L2_NUM" -gt 0 ]; then
  EFFECTIVE_UNSAFE_L2_NUM="$SEQ_CROSS_UNSAFE_L2_NUM"
fi

if [ "$SYNC_HEAD_L1_NUM" -gt 0 ]; then
  if [ "$EFFECTIVE_UNSAFE_L2_NUM" -gt 0 ]; then
    if [ "$SYNC_CUR_L1_NUM" -gt 0 ]; then
      L1_LAG=$((SYNC_HEAD_L1_NUM - SYNC_CUR_L1_NUM))
      if [ "$L1_LAG" -gt "$L2_MAX_L1_DERIVATION_LAG" ]; then
        fail "L1 derivation lag too high (head=$SYNC_HEAD_L1_NUM current=$SYNC_CUR_L1_NUM lag=$L1_LAG > $L2_MAX_L1_DERIVATION_LAG)"
      fi
      echo "OK: L1 derivation lag within threshold"
    else
      if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
        warn "current_l1 is zero; op-node has not derived L1 yet"
      else
        echo "OK: L1 derivation lag check skipped (L2_REQUIRE_L2_PROGRESS=0)"
      fi
    fi
    if [ "$SYNC_SAFE_L2_NUM" -gt 0 ]; then
      SAFE_LAG=$((EFFECTIVE_UNSAFE_L2_NUM - SYNC_SAFE_L2_NUM))
      if [ "$SAFE_LAG" -gt "$L2_MAX_L2_SAFE_LAG" ]; then
        # If "finality on L1" is implemented via a separate rollup contract, OP safe head is not the finality signal.
        # In that mode, gate finality via the rollup proposer/contract instead.
        if [ "$ROLLUP_GATING_L2_FINALITY_ON_L1" = "true" ]; then
          warn "L2 safe lag high (unsafe=$SYNC_UNSAFE_L2_NUM safe=$SYNC_SAFE_L2_NUM lag=$SAFE_LAG > $L2_MAX_L2_SAFE_LAG) (ignored due to rollup finality gating)"
        else
          if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
            fail "L2 safe lag too high (unsafe=$SYNC_UNSAFE_L2_NUM safe=$SYNC_SAFE_L2_NUM lag=$SAFE_LAG > $L2_MAX_L2_SAFE_LAG)"
          else
            warn "L2 safe lag too high (unsafe=$SYNC_UNSAFE_L2_NUM safe=$SYNC_SAFE_L2_NUM lag=$SAFE_LAG > $L2_MAX_L2_SAFE_LAG)"
          fi
        fi
      fi
      if [ "$SAFE_LAG" -le "$L2_MAX_L2_SAFE_LAG" ]; then
        echo "OK: L2 safe lag within threshold"
      fi
    else
      if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
        warn "safe_l2 is zero; no safe L2 blocks observed yet"
      else
        echo "OK: L2 safe lag check skipped (L2_REQUIRE_L2_PROGRESS=0)"
      fi
    fi
  else
    if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
      # Some stacks report zeros for optimism_syncStatus while execution blocks are advancing.
      # For progress gating, we rely on eth_blockNumber delta (checked earlier).
      warn "optimism_syncStatus reports unsafe_l2=0; skipping derivation/safe-lag checks"
    fi
    echo "OK: derivation/safe-lag checks skipped (insufficient syncStatus data)"
  fi
fi

metric_urls=( "$L2_GETH_METRICS_URL" "$OP_NODE_METRICS_URL" "$OP_SEQUENCER_METRICS_URL" "$OP_BATCHER_METRICS_URL" )
if [ "$ROLLUP_GATING_L2_FINALITY_ON_L1" = "true" ]; then
  if [ -n "$L2_ROLLUP_PROPOSER_HEALTH_URL" ]; then
    metric_urls+=( "$L2_ROLLUP_PROPOSER_HEALTH_URL" )
  fi
else
  metric_urls+=( "$OP_PROPOSER_METRICS_URL" )
fi

for url in "${metric_urls[@]}"; do
  if ! curl -fsS --max-time 4 "$url" >/dev/null 2>&1; then
    fail "metrics endpoint not reachable: $url"
  fi
  echo "OK: metrics reachable: $url"
done

if [ "$AI_MONITOR_REQUIRED" = "1" ]; then
  if ! curl -fsS --max-time 4 "$AI_MONITOR_URL" >/dev/null 2>&1; then
    fail "ai-monitor not reachable at $AI_MONITOR_URL"
  fi
  echo "OK: ai-monitor reachable"
else
  if curl -fsS --max-time 2 "$AI_MONITOR_URL" >/dev/null 2>&1; then
    echo "OK: ai-monitor reachable"
  else
    echo "OK: ai-monitor check skipped (AI_MONITOR_REQUIRED=0)"
  fi
fi

if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
  NOW_TS="$(date +%s)"
  LAST_BATCH_SUCCESS="$(metric_value_with_label "$OP_BATCHER_METRICS_URL" "op_batcher_default_last_batcher_tx_unix" "stage=\\\"success\\\"" || true)"
  LAST_BATCH_SUCCESS_INT="$(to_int "${LAST_BATCH_SUCCESS:-0}")"
  if [ "$LAST_BATCH_SUCCESS_INT" -gt 0 ]; then
    BATCH_IDLE=$((NOW_TS - LAST_BATCH_SUCCESS_INT))
    if [ "$BATCH_IDLE" -gt "$L2_MAX_BATCHER_IDLE_SECONDS" ]; then
      fail "batcher idle for ${BATCH_IDLE}s (threshold ${L2_MAX_BATCHER_IDLE_SECONDS}s)"
    fi
    echo "OK: batcher activity within threshold"
  else
    fail "batcher has not submitted a successful tx yet"
  fi

  LAST_PROPOSER_PUBLISH="$(metric_value "$OP_PROPOSER_METRICS_URL" "op_proposer_default_txmgr_last_publish_unix" || true)"
  LAST_PROPOSER_PUBLISH_INT="$(to_int "${LAST_PROPOSER_PUBLISH:-0}")"
  if [ "$LAST_PROPOSER_PUBLISH_INT" -gt 0 ]; then
    PROPOSER_IDLE=$((NOW_TS - LAST_PROPOSER_PUBLISH_INT))
    if [ "$PROPOSER_IDLE" -gt "$L2_MAX_PROPOSER_IDLE_SECONDS" ]; then
      fail "proposer idle for ${PROPOSER_IDLE}s (threshold ${L2_MAX_PROPOSER_IDLE_SECONDS}s)"
    fi
    echo "OK: proposer activity within threshold"
  else
    fail "proposer has not published an output yet"
  fi
else
  echo "OK: batcher/proposer idle checks skipped (L2_REQUIRE_L2_PROGRESS=0)"
fi

if [ "$CHALLENGER_REQUIRED" = "1" ]; then
  if ! curl -fsS --max-time 4 "$L2_CHALLENGER_METRICS_URL" >/dev/null 2>&1; then
    fail "challenger metrics not reachable: $L2_CHALLENGER_METRICS_URL"
  fi
  echo "OK: challenger metrics reachable"
else
  if curl -fsS --max-time 2 "$L2_CHALLENGER_METRICS_URL" >/dev/null 2>&1; then
    echo "OK: challenger metrics reachable"
  else
    warn "challenger metrics not reachable (set CHALLENGER_REQUIRED=1 to enforce)"
  fi
fi

if [ -f "$L1_DEPLOYMENTS_JSON" ]; then
  read_addr() {
    python3 - <<'PY' "$L1_DEPLOYMENTS_JSON" "$1"
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
keys = [k.strip() for k in sys.argv[2].split(",") if k.strip()]
for k in keys:
    v = data.get(k, "")
    if v and v != "null":
        print(v)
        break
else:
    print("")
PY
  }
  dgf_addr="$(read_addr "DisputeGameFactoryProxy,DisputeGameFactory")"
  dgf_code=""
  if [ -n "$dgf_addr" ] && [ "$dgf_addr" != "null" ]; then
    dgf_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$dgf_addr\", \"latest\"]" || true)"
    dgf_code="$(json_result "$dgf_raw" || true)"
  fi
  contracts=(
    "SystemConfigProxy,SystemConfig"
    "OptimismPortalProxy,OptimismPortal"
    "L2OutputOracleProxy,L1OutputOracle"
    "DisputeGameFactoryProxy,DisputeGameFactory"
    "L1StandardBridgeProxy,L1StandardBridge"
    "L1CrossDomainMessengerProxy,L1CrossDomainMessenger"
    "L1Erc721BridgeProxy,L1Erc721Bridge"
  )
  for name_keys in "${contracts[@]}"; do
    name="${name_keys%%,*}"
    addr="$(read_addr "$name_keys")"
    if [ -z "$addr" ] || [ "$addr" = "null" ]; then
      warn "missing address for $name in $L1_DEPLOYMENTS_JSON"
      continue
    fi
    code_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$addr\", \"latest\"]" || true)"
    code="$(json_result "$code_raw" || true)"
    if [ -z "$code" ]; then
      fail "failed to fetch L1 contract code for $name at $addr"
    fi
    if [ -z "$code" ] || [ "$code" = "0x" ]; then
      if [ "$name" = "L2OutputOracleProxy" ] && [ -n "$dgf_code" ] && [ "$dgf_code" != "0x" ]; then
        warn "L2OutputOracleProxy missing; DisputeGameFactoryProxy deployed at $dgf_addr"
        continue
      fi
      if [ "$name" = "L1StandardBridgeProxy" ]; then
        bridge_candidate="${BRIDGE_ADDRESS:-${BRIDGE_L2L3_ADDRESS:-${FUT_TOKEN_BRIDGE:-}}}"
        if [ -n "$bridge_candidate" ]; then
          bridge_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$bridge_candidate\", \"latest\"]" || true)"
          bridge_code="$(json_result "$bridge_raw" || true)"
          if [ -n "$bridge_code" ] && [ "$bridge_code" != "0x" ]; then
            warn "L1StandardBridgeProxy missing; bridge contract found at $bridge_candidate"
            continue
          fi
        fi
      fi
      if [ "$name" = "L1CrossDomainMessengerProxy" ]; then
        router_candidate="${BRIDGE_ROUTER:-${FUT_BRIDGE_ROUTER:-}}"
        if [ -n "$router_candidate" ]; then
          router_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$router_candidate\", \"latest\"]" || true)"
          router_code="$(json_result "$router_raw" || true)"
          if [ -n "$router_code" ] && [ "$router_code" != "0x" ]; then
            warn "L1CrossDomainMessengerProxy missing; bridge router found at $router_candidate"
            continue
          fi
        fi
      fi
      if [ "$name" = "L1Erc721BridgeProxy" ]; then
        nft_candidate="${NFT_BRIDGE_ADDRESS:-${FUT_NFT_BRIDGE:-}}"
        if [ -n "$nft_candidate" ]; then
          nft_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$nft_candidate\", \"latest\"]" || true)"
          nft_code="$(json_result "$nft_raw" || true)"
          if [ -n "$nft_code" ] && [ "$nft_code" != "0x" ]; then
            warn "L1Erc721BridgeProxy missing; NFT bridge found at $nft_candidate"
            continue
          fi
        fi
      fi
      fail "L1 contract $name not deployed at $addr"
    fi
    echo "OK: L1 contract $name at $addr"
  done
else
  warn "missing l1-deployments.json; skipping L1 contract checks"
fi

# Ensure L2-side predeploys are wired to the expected L1 bridge + messenger.
# When these addresses diverge, deposits will be derived but cross-domain relay will revert.
if [ -n "${L1_CROSS_DOMAIN_MESSENGER_ADDRESS:-}" ]; then
  l2_xdm="0x4200000000000000000000000000000000000007"
  raw="$(jsonrpc_params "$HOST_L2_RPC" "eth_call" "[{\"to\":\"$l2_xdm\",\"data\":\"0xa7119869\"},\"latest\"]" || true)"
  word="$(json_result "$raw" || true)"
  onchain="$(abi_decode_address "$word" || true)"
  if [ -n "$onchain" ] && [ "${onchain,,}" != "${L1_CROSS_DOMAIN_MESSENGER_ADDRESS,,}" ]; then
    msg="L2 CrossDomainMessenger expects L1 messenger $onchain, but L1_CROSS_DOMAIN_MESSENGER_ADDRESS=$L1_CROSS_DOMAIN_MESSENGER_ADDRESS (bridging will fail)"
    if [ "$L2_REQUIRE_BRIDGE_WIRING" = "1" ]; then
      fail "$msg"
    else
      warn "$msg (set L2_REQUIRE_BRIDGE_WIRING=1 to fail closed)"
    fi
  fi
fi
if [ -n "${L1_STANDARD_BRIDGE_ADDRESS:-}" ]; then
  l2_bridge="0x4200000000000000000000000000000000000010"
  raw="$(jsonrpc_params "$HOST_L2_RPC" "eth_call" "[{\"to\":\"$l2_bridge\",\"data\":\"0x36c717c1\"},\"latest\"]" || true)"
  word="$(json_result "$raw" || true)"
  onchain="$(abi_decode_address "$word" || true)"
  if [ -n "$onchain" ] && [ "${onchain,,}" != "${L1_STANDARD_BRIDGE_ADDRESS,,}" ]; then
    msg="L2 StandardBridge expects L1 bridge $onchain, but L1_STANDARD_BRIDGE_ADDRESS=$L1_STANDARD_BRIDGE_ADDRESS (bridging will fail)"
    if [ "$L2_REQUIRE_BRIDGE_WIRING" = "1" ]; then
      fail "$msg"
    else
      warn "$msg (set L2_REQUIRE_BRIDGE_WIRING=1 to fail closed)"
    fi
  fi
fi

if [ "${USE_CUSTOM_GAS_TOKEN:-}" = "true" ]; then
  if [ -z "${CUSTOM_GAS_TOKEN_ADDRESS:-}" ]; then
    fail "USE_CUSTOM_GAS_TOKEN=true but CUSTOM_GAS_TOKEN_ADDRESS missing"
  fi
  gas_code_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$CUSTOM_GAS_TOKEN_ADDRESS\", \"latest\"]" || true)"
  code="$(json_result "$gas_code_raw" || true)"
  if [ -z "$code" ]; then
    fail "failed to fetch gas token code for $CUSTOM_GAS_TOKEN_ADDRESS"
  fi
  if [ -z "$code" ] || [ "$code" = "0x" ]; then
    fail "custom gas token not deployed at $CUSTOM_GAS_TOKEN_ADDRESS"
  fi
  if [ -z "${GAS_TOKEN_SYMBOL:-}" ]; then
    fail "GAS_TOKEN_SYMBOL missing while USE_CUSTOM_GAS_TOKEN=true"
  fi
  GENESIS_GAS_TOKEN="$(read_json "$L2_GENESIS_JSON" "config.gasToken")"
  if [ -z "$GENESIS_GAS_TOKEN" ] || [ "$GENESIS_GAS_TOKEN" = "null" ]; then
    warn "genesis-l2.json config.gasToken is null; ensure SystemConfig enforces GST"
  else
    echo "OK: genesis gasToken set"
  fi
  echo "OK: custom gas token deployed"
fi

if [ "$ROLLUP_GATING_L2_FINALITY_ON_L1" = "true" ]; then
  if [ -z "$L1_ROLLUP_L2_ADDRESS" ]; then
    if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
      fail "rollup gating enabled but L1_ROLLUP_L2_ADDRESS missing"
    else
      warn "rollup gating enabled but L1_ROLLUP_L2_ADDRESS missing"
    fi
  elif [ -z "$L2_ROLLUP_PROPOSER_HEALTH_URL" ]; then
    if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
      fail "rollup gating enabled but L2_ROLLUP_PROPOSER_HEALTH_URL missing"
    else
      warn "rollup gating enabled but L2_ROLLUP_PROPOSER_HEALTH_URL missing"
    fi
  else
    RH_RAW="$(rollup_proposer_health || true)"
    RH_OK="$(json_field "$RH_RAW" "ok" || true)"
    RH_OBSERVE_ONLY="$(json_field "$RH_RAW" "observeOnly" || true)"
    RH_NEXT="$(json_field "$RH_RAW" "nextChildBlock" || true)"
    if [ "$RH_OK" != "true" ] || [ -z "$RH_NEXT" ]; then
      if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
        fail "rollup proposer not reachable/healthy at $L2_ROLLUP_PROPOSER_HEALTH_URL"
      else
        warn "rollup proposer not reachable/healthy at $L2_ROLLUP_PROPOSER_HEALTH_URL"
      fi
    else
      if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ] && [ "$RH_OBSERVE_ONLY" = "true" ]; then
        fail "rollup proposer is observe-only (cannot propose/finalize batches) but rollup gating is enabled"
      fi

      L2_HEAD="$(rpc_block_number_dec "$HOST_L2_RPC" || true)"
      if [ -n "$L2_HEAD" ]; then
        if [ "$RH_NEXT" -gt 0 ]; then
          ROLLUP_END=$((RH_NEXT - 1))
        else
          ROLLUP_END=0
        fi
        ROLLUP_LAG=$((L2_HEAD - ROLLUP_END))
        if [ "$ROLLUP_LAG" -lt 0 ]; then ROLLUP_LAG=0; fi

        if [ "$ROLLUP_LAG" -gt "$L2_MAX_ROLLUP_LAG" ]; then
          if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
            fail "rollup finality lag too high (l2_head=$L2_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG > $L2_MAX_ROLLUP_LAG)"
          else
            warn "rollup finality lag too high (l2_head=$L2_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG > $L2_MAX_ROLLUP_LAG)"
          fi
        else
          echo "OK: rollup finality lag within threshold (l2_head=$L2_HEAD rollup_end=$ROLLUP_END lag=$ROLLUP_LAG)"
        fi
      fi

      if [ "$L2_REQUIRE_L2_PROGRESS" = "1" ]; then
        require_rollup_progress "$L2_ROLLUP_PROGRESS_SAMPLE_SECONDS" "$L2_ROLLUP_PROGRESS_MIN_DELTA"
      else
        echo "OK: rollup proposer progress check skipped (L2_REQUIRE_L2_PROGRESS=0)"
      fi
    fi
  fi
fi

echo "[doctor-l2] OK"
