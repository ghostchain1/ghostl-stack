#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_L2="${L2_ENV_FILE:-$ROOT_DIR/infra/opstack/.env}"
ENV_L3="${L3_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l3}"

if [ -f "$ENV_L2" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L2"
  set +a
fi
if [ -f "$ENV_L3" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L3"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"

L2_OUTPUT_ORACLE_ADDRESS="${L2_OUTPUT_ORACLE_ADDRESS:-}"
L3_L2OO_ADDRESS="${L3_L2OO_ADDRESS:-}"
L3_PORTAL_ADDRESS="${L3_PORTAL_ADDRESS:-}"

log() {
  printf '[federation-check] %s\n' "$*"
}

jsonrpc() {
  local url="$1"
  local method="$2"
  local params="${3:-[]}";
  curl -sS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
}

hex_to_dec() {
  python3 - "$1" <<'PY'
import sys
val=sys.argv[1]
try:
    if val.startswith('0x'):
        print(int(val,16))
    else:
        print(int(val))
except Exception:
    print(0)
PY
}

get_block_ts() {
  local url="$1"
  local block_hex
  block_hex=$(jsonrpc "$url" eth_blockNumber | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')
  jsonrpc "$url" eth_getBlockByNumber "[\"$block_hex\", false]" | \
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("timestamp","0x0"))'
}

check_code() {
  local url="$1"
  local addr="$2"
  if [ -z "$addr" ]; then
    log "WARN: missing address for code check"
    return 1
  fi
  local code
  code=$(jsonrpc "$url" eth_getCode "[\"$addr\", \"latest\"]" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",""))')
  if [ -z "$code" ] || [ "$code" = "0x" ]; then
    log "FAIL: no code at $addr on $url"
    return 1
  fi
  log "OK: code present at $addr"
  return 0
}

log "L1 RPC: $HOST_L1_RPC"
log "L2 RPC: $HOST_L2_RPC"
log "L3 RPC: $HOST_L3_RPC"

L1_CHAIN_ID_HEX=$(jsonrpc "$HOST_L1_RPC" eth_chainId | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')
L2_CHAIN_ID_HEX=$(jsonrpc "$HOST_L2_RPC" eth_chainId | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')
L3_CHAIN_ID_HEX=$(jsonrpc "$HOST_L3_RPC" eth_chainId | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')

log "Chain IDs: L1=$(hex_to_dec "$L1_CHAIN_ID_HEX") L2=$(hex_to_dec "$L2_CHAIN_ID_HEX") L3=$(hex_to_dec "$L3_CHAIN_ID_HEX")"

L1_TS_HEX=$(get_block_ts "$HOST_L1_RPC")
L2_TS_HEX=$(get_block_ts "$HOST_L2_RPC")
L3_TS_HEX=$(get_block_ts "$HOST_L3_RPC")

L1_TS=$(hex_to_dec "$L1_TS_HEX")
L2_TS=$(hex_to_dec "$L2_TS_HEX")
L3_TS=$(hex_to_dec "$L3_TS_HEX")

L2_PARENT_LAG=$((L1_TS - L2_TS))
L3_PARENT_LAG=$((L2_TS - L3_TS))

log "parent_sync_ok{layer=l2}=${L2_PARENT_LAG} (seconds behind L1)"
log "parent_sync_ok{layer=l3}=${L3_PARENT_LAG} (seconds behind L2)"

log "Checking L2 output oracle on L1"
check_code "$HOST_L1_RPC" "$L2_OUTPUT_ORACLE_ADDRESS"

log "Checking L3 output oracle + portal on L2"
check_code "$HOST_L2_RPC" "$L3_L2OO_ADDRESS"
check_code "$HOST_L2_RPC" "$L3_PORTAL_ADDRESS"

log "Federation check complete"
