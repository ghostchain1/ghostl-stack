#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
L1_ENV_FILE="${L1_ENV_FILE:-$ROOT_DIR/infra/ghostchain/.env.l1}"

if [ -f "$L1_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L1_ENV_FILE"
  set +a
fi

L1_COMPOSE_FILE="${L1_COMPOSE_FILE:-$ROOT_DIR/infra/ghostchain/docker-compose.eth.yml}"
L1_GENESIS_PATH="${L1_GENESIS_PATH:-$ROOT_DIR/infra/ghostchain/geth/genesis.json}"
L1_RUN_SCRIPT="${L1_RUN_SCRIPT:-$ROOT_DIR/infra/ghostchain/geth/run-node.sh}"
L1_KEY_DIR="${L1_KEY_DIR:-$ROOT_DIR/infra/ghostchain/geth/keys}"
L1_DATA_DIR="${L1_DATA_DIR:-$ROOT_DIR/infra/ghostchain/data}"

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
L1_METRICS_URL="${L1_METRICS_URL:-http://localhost:18660/debug/metrics}"
L1_METRICS_PROM_URL="${L1_METRICS_PROM_URL:-http://localhost:18660/debug/metrics/prometheus}"
L1_METRICS_PROM_TARGET="${L1_METRICS_PROM_TARGET:-http://host.docker.internal:18660/debug/metrics/prometheus}"

L1_SECRETS_SOURCE="${L1_SECRETS_SOURCE:-dev}"
L1_SECRETS_DIR="${L1_SECRETS_DIR:-$ROOT_DIR/infra/ghostchain/secrets}"
ALLOW_DEV_SECRETS="${ALLOW_DEV_SECRETS:-0}"
VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
VAULT_ROLE_ID="${VAULT_ROLE_ID:-}"
VAULT_SECRET_ID="${VAULT_SECRET_ID:-}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

L1_CHAIN_ID_EXPECTED="${L1_CHAIN_ID_EXPECTED:-}"
ALLOW_INSECURE_KEY_PERMS="${ALLOW_INSECURE_KEY_PERMS:-0}"
REQUIRE_PROM_TARGET="${REQUIRE_PROM_TARGET:-0}"

GENESIS_SHA256_EXPECTED="696f9da9d751b5ccdac8464eb6a2a8af88be64ca1f182f7af81b4e24600e3dd7"
RUN_SCRIPT_SHA256_EXPECTED="ad4d931cc7c1c61a9f9de5c006f22cb3ab64de4bef907302ed76698661d4d285"

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }

need_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"
}

jsonrpc() {
  local url="$1"
  local method="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}"
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

get_chain_id_from_genesis() {
  python3 - <<'PY' "$1"
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
print(data.get("config", {}).get("chainId", ""))
PY
}

check_sha256() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    fail "checksum mismatch for $path (expected $expected, got $actual)"
  fi
  echo "OK: checksum $path"
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

echo "[doctor-l1] starting"

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

if [ "$L1_SECRETS_SOURCE" = "vault" ]; then
  if [ -z "$VAULT_ADDR" ] || { [ -z "$VAULT_TOKEN" ] && { [ -z "$VAULT_ROLE_ID" ] || [ -z "$VAULT_SECRET_ID" ]; }; }; then
    fail "Vault auth missing (set VAULT_ADDR and VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID)"
  fi
  for f in boot.key node1.key node2.key jwtsecret; do
    if [ ! -f "$L1_SECRETS_DIR/$f" ]; then
      fail "Vault secret missing: $L1_SECRETS_DIR/$f"
    fi
  done
  echo "OK: Vault secrets present"
else
  if [ "$ALLOW_DEV_SECRETS" != "1" ]; then
    fail "Dev secrets blocked; set ALLOW_DEV_SECRETS=1 or use Vault"
  fi
  echo "OK: dev secrets allowed"
fi

[ -f "$L1_COMPOSE_FILE" ] || fail "missing L1 compose file: $L1_COMPOSE_FILE"
[ -f "$L1_GENESIS_PATH" ] || fail "missing genesis file: $L1_GENESIS_PATH"
[ -f "$L1_RUN_SCRIPT" ] || fail "missing run-node script: $L1_RUN_SCRIPT"
[ -d "$L1_KEY_DIR" ] || fail "missing key dir: $L1_KEY_DIR"
[ -d "$L1_DATA_DIR" ] || fail "missing data dir: $L1_DATA_DIR"

check_sha256 "$L1_GENESIS_PATH" "$GENESIS_SHA256_EXPECTED"
check_sha256 "$L1_RUN_SCRIPT" "$RUN_SCRIPT_SHA256_EXPECTED"

GENESIS_CHAIN_ID="$(get_chain_id_from_genesis "$L1_GENESIS_PATH")"
if [ -z "$L1_CHAIN_ID_EXPECTED" ]; then
  L1_CHAIN_ID_EXPECTED="$GENESIS_CHAIN_ID"
fi
if [ "$GENESIS_CHAIN_ID" != "$L1_CHAIN_ID_EXPECTED" ]; then
  fail "genesis chainId=$GENESIS_CHAIN_ID does not match expected=$L1_CHAIN_ID_EXPECTED"
fi
echo "OK: genesis chainId=$GENESIS_CHAIN_ID"

required_ports=(18545 18546 18551 18552 18660)
for port in "${required_ports[@]}"; do
  if port_listening "$port"; then
    echo "OK: port $port listening"
  else
    warn "port $port not listening"
  fi
done

KEYS_FOUND=0
for key in "$L1_KEY_DIR"/*.key; do
  if [ -f "$key" ]; then
    KEYS_FOUND=1
    mode=""
    if stat -c "%a" "$key" >/dev/null 2>&1; then
      mode="$(stat -c "%a" "$key")"
    elif stat -f "%Lp" "$key" >/dev/null 2>&1; then
      mode="$(stat -f "%Lp" "$key")"
    fi
    if [ -n "$mode" ] && [ "$mode" -gt 600 ]; then
      if [ "$ALLOW_INSECURE_KEY_PERMS" = "1" ]; then
        warn "key $key has permissions $mode (expected 600); ALLOW_INSECURE_KEY_PERMS=1"
      else
        fail "key $key has permissions $mode (expected 600). Fix: chmod 600 $key"
      fi
    else
      echo "OK: key $key permissions ${mode:-unknown}"
    fi
  fi
done
if [ "$KEYS_FOUND" -eq 0 ]; then
  fail "no validator keys found in $L1_KEY_DIR"
fi

if ! docker compose -f "$L1_COMPOSE_FILE" config >/dev/null 2>&1; then
  fail "compose config invalid for $L1_COMPOSE_FILE"
fi
echo "OK: compose config valid"

if jsonrpc "$HOST_L1_RPC" "eth_chainId" >/tmp/doctor-l1-chainid.json 2>/dev/null; then
  RPC_CHAIN_ID_HEX="$(python3 - <<'PY' /tmp/doctor-l1-chainid.json
import json, sys
data = json.load(open(sys.argv[1]))
print(data.get("result",""))
PY
)"
  RPC_CHAIN_ID_DEC="$(hex_to_dec "${RPC_CHAIN_ID_HEX:-0}")"
  if [ -n "$RPC_CHAIN_ID_HEX" ] && [ "$RPC_CHAIN_ID_DEC" != "$L1_CHAIN_ID_EXPECTED" ]; then
    fail "RPC chainId=$RPC_CHAIN_ID_DEC (hex $RPC_CHAIN_ID_HEX) does not match expected=$L1_CHAIN_ID_EXPECTED"
  fi
  echo "OK: RPC chainId=${RPC_CHAIN_ID_DEC:-unknown}"
else
  fail "L1 RPC not reachable at $HOST_L1_RPC"
fi

if ! jsonrpc "$HOST_L1_RPC" "eth_blockNumber" >/dev/null 2>&1; then
  fail "L1 RPC blockNumber failed at $HOST_L1_RPC"
fi
if ! jsonrpc "$HOST_L1_RPC" "net_peerCount" >/dev/null 2>&1; then
  warn "L1 RPC peerCount failed at $HOST_L1_RPC"
else
  echo "OK: RPC peerCount reachable"
fi

if ! jsonrpc "$HOST_L1_RPC" "eth_syncing" >/dev/null 2>&1; then
  warn "L1 RPC syncing check failed at $HOST_L1_RPC"
else
  echo "OK: RPC syncing reachable"
fi

if ! curl -fsS --max-time 3 "$L1_METRICS_PROM_URL" >/dev/null 2>&1; then
  fail "L1 metrics endpoint not reachable: $L1_METRICS_PROM_URL"
fi
echo "OK: L1 metrics reachable"

if curl -fsS --max-time 3 "$PROMETHEUS_URL/-/ready" >/dev/null 2>&1; then
  echo "OK: Prometheus ready"
  if curl -fsS --max-time 3 "$PROMETHEUS_URL/api/v1/targets" >/tmp/doctor-l1-targets.json 2>/dev/null; then
    if grep -q "$L1_METRICS_PROM_TARGET" /tmp/doctor-l1-targets.json; then
      echo "OK: Prometheus targets include L1 metrics"
    else
      if [ "$REQUIRE_PROM_TARGET" = "1" ]; then
        fail "Prometheus targets missing L1 metrics ($L1_METRICS_PROM_TARGET)"
      else
        warn "Prometheus targets missing L1 metrics ($L1_METRICS_PROM_TARGET)"
      fi
    fi
  else
    warn "Prometheus targets API not reachable"
  fi
else
  warn "Prometheus not reachable at $PROMETHEUS_URL"
fi

echo "[doctor-l1] OK"
