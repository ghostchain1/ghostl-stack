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

L2_COMPOSE_FILE="${L2_COMPOSE_FILE:-$ROOT_DIR/infra/opstack/docker-compose.yml}"
L2_CONFIG_DIR="${L2_CONFIG_DIR:-$ROOT_DIR/infra/opstack/config}"
L2_ROLLUP_JSON="${L2_ROLLUP_JSON:-$L2_CONFIG_DIR/rollup.json}"
L2_GENESIS_JSON="${L2_GENESIS_JSON:-$L2_CONFIG_DIR/genesis-l2.json}"
L1_CHAIN_JSON="${L1_CHAIN_JSON:-$L2_CONFIG_DIR/l1-chain.json}"
L2_CHECKSUMS_FILE="${L2_CHECKSUMS_FILE:-$L2_CONFIG_DIR/checksums.txt}"
L1_DEPLOYMENTS_JSON="${L1_DEPLOYMENTS_JSON:-$L2_CONFIG_DIR/l1-deployments.json}"
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

echo "[doctor-l2] starting"

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

if ! docker compose -f "$L2_COMPOSE_FILE" config >/dev/null 2>&1; then
  fail "compose config invalid for $L2_COMPOSE_FILE"
fi

echo "OK: compose config valid"

L2_GENESIS_CHAIN_ID="$(read_json "$L2_GENESIS_JSON" "config.chainId")"
if [ -n "$L2_CHAIN_ID_EXPECTED" ] && [ "$L2_GENESIS_CHAIN_ID" != "$L2_CHAIN_ID_EXPECTED" ]; then
  fail "L2 genesis chainId=$L2_GENESIS_CHAIN_ID does not match expected=$L2_CHAIN_ID_EXPECTED"
fi

echo "OK: L2 genesis chainId=${L2_GENESIS_CHAIN_ID:-unknown}"

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

ROLLUP_L1_HASH="$(read_json "$L2_ROLLUP_JSON" "genesis.l1.hash")"
ROLLUP_L2_HASH="$(read_json "$L2_ROLLUP_JSON" "genesis.l2.hash")"
if [ -n "$ROLLUP_L1_HASH" ] && [ "$ROLLUP_L1_HASH" != "null" ]; then
  L1_BLOCK0_RAW="$(jsonrpc_params "$HOST_L1_RPC" "eth_getBlockByNumber" '["0x0", false]' || true)"
  L1_BLOCK0_HASH="$(json_result_field "$L1_BLOCK0_RAW" "hash" || true)"
  if [ -z "$L1_BLOCK0_HASH" ]; then
    fail "failed to fetch L1 genesis block from $HOST_L1_RPC"
  fi
  if [ -n "$L1_BLOCK0_HASH" ] && [ "$L1_BLOCK0_HASH" != "$ROLLUP_L1_HASH" ]; then
    fail "rollup.json L1 genesis hash mismatch (rollup=$ROLLUP_L1_HASH rpc=$L1_BLOCK0_HASH)"
  fi
  echo "OK: rollup L1 genesis hash matches"
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

for url in "$L2_GETH_METRICS_URL" "$OP_NODE_METRICS_URL" "$OP_SEQUENCER_METRICS_URL" "$OP_BATCHER_METRICS_URL" "$OP_PROPOSER_METRICS_URL"; do
  if ! curl -fsS --max-time 4 "$url" >/dev/null 2>&1; then
    fail "metrics endpoint not reachable: $url"
  fi
  echo "OK: metrics reachable: $url"
done

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
print(data.get(sys.argv[2], ""))
PY
  }
  dgf_addr="$(read_addr "DisputeGameFactoryProxy")"
  dgf_code=""
  if [ -n "$dgf_addr" ] && [ "$dgf_addr" != "null" ]; then
    dgf_raw="$(jsonrpc_params "$HOST_L1_RPC" "eth_getCode" "[\"$dgf_addr\", \"latest\"]" || true)"
    dgf_code="$(json_result "$dgf_raw" || true)"
  fi
  contracts=(
    SystemConfigProxy
    OptimismPortalProxy
    L2OutputOracleProxy
    DisputeGameFactoryProxy
    L1StandardBridgeProxy
    L1CrossDomainMessengerProxy
    L1Erc721BridgeProxy
  )
  for name in "${contracts[@]}"; do
    addr="$(read_addr "$name")"
    if [ -z "$addr" ] || [ "$addr" = "null" ]; then
      warn "missing address for $name in l1-deployments.json"
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
    warn "genesis-l2.json config.gasToken is null; ensure SystemConfig enforces GHOST"
  else
    echo "OK: genesis gasToken set"
  fi
  echo "OK: custom gas token deployed"
fi

echo "[doctor-l2] OK"
