#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_L2="${PHASE6_ENV_L2:-$ROOT_DIR/infra/opstack/.env}"
ENV_L3="${PHASE6_ENV_L3:-$ROOT_DIR/infra/opstack/.env.l3}"
COMPOSE_L2="${PHASE6_COMPOSE_L2:-$ROOT_DIR/infra/opstack/docker-compose.yml}"
COMPOSE_L3="${PHASE6_COMPOSE_L3:-$ROOT_DIR/infra/opstack/docker-compose.l3.yml}"

if [[ -f "$ENV_L2" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L2"
  set +a
fi
if [[ -f "$ENV_L3" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L3"
  set +a
fi

is_zero_address() {
  local value="${1:-}"
  [[ -z "$value" || "$value" =~ ^0x0{40}$ ]]
}

section_has() {
  local file="$1"
  local service="$2"
  local needle="$3"
  awk -v service="$service" '
    $0 ~ "^  " service ":" { in_service=1; next }
    in_service && $0 ~ /^  [A-Za-z0-9_.-]+:/ { in_service=0 }
    in_service { print }
  ' "$file" | grep -q -- "$needle"
}

rpc_call() {
  local rpc_url="$1"
  local payload="$2"
  curl -sS --fail --max-time 8 -H 'content-type: application/json' --data "$payload" "$rpc_url"
}

eth_get_code() {
  local rpc_url="$1"
  local address="$2"
  local body
  body="$(rpc_call "$rpc_url" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$address\",\"latest\"]}")"
  node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(0,"utf8"));console.log(x.result||"")' <<<"$body"
}

eth_call_version() {
  local rpc_url="$1"
  local address="$2"
  local body
  body="$(rpc_call "$rpc_url" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$address\",\"data\":\"0x54fd4d50\"},\"latest\"]}")"
  node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(0,"utf8"));console.log(x.result||"")' <<<"$body"
}

failures=0

if ! section_has "$COMPOSE_L2" "op-proposer" "--rollup-rpc="; then
  echo "[phase6] FAIL: op-proposer missing --rollup-rpc"
  failures=$((failures+1))
fi
if ! section_has "$COMPOSE_L2" "op-proposer" "--l1-eth-rpc="; then
  echo "[phase6] FAIL: op-proposer missing --l1-eth-rpc"
  failures=$((failures+1))
fi
if ! section_has "$COMPOSE_L3" "l3-op-proposer" "--rollup-rpc="; then
  echo "[phase6] FAIL: l3-op-proposer missing --rollup-rpc"
  failures=$((failures+1))
fi
if ! section_has "$COMPOSE_L3" "l3-op-proposer" "--l1-eth-rpc="; then
  echo "[phase6] FAIL: l3-op-proposer missing --l1-eth-rpc"
  failures=$((failures+1))
fi

L2_PARENT_RPC="${PHASE6_L2_PARENT_RPC:-${HOST_L1_RPC:-${L1_RPC:-http://localhost:18545}}}"
L3_PARENT_RPC="${PHASE6_L3_PARENT_RPC:-${HOST_L2_RPC:-${L2_RPC:-http://localhost:29547}}}"

L2_OUTPUT_TARGET="${L2_GAME_FACTORY_ADDRESS:-${L2OO_ADDRESS:-${L2_OUTPUT_ORACLE_ADDRESS:-}}}"
L3_OUTPUT_TARGET="${L3_GAME_FACTORY_ADDRESS:-${L3_L2OO_ADDRESS:-${L3_OUTPUT_ORACLE_ADDRESS:-}}}"

L2_MODE="${PHASE6_L2_MODE:-}"
L3_MODE="${PHASE6_L3_MODE:-}"
if [[ -z "$L2_MODE" ]]; then
  if [[ -n "${L2_GAME_FACTORY_ADDRESS:-}" ]] && ! is_zero_address "${L2_GAME_FACTORY_ADDRESS:-}"; then
    L2_MODE="fault-proof"
  else
    L2_MODE="output-oracle"
  fi
fi
if [[ -z "$L3_MODE" ]]; then
  if [[ -n "${L3_GAME_FACTORY_ADDRESS:-}" ]] && ! is_zero_address "${L3_GAME_FACTORY_ADDRESS:-}"; then
    L3_MODE="fault-proof"
  else
    L3_MODE="output-oracle"
  fi
fi

if is_zero_address "$L2_OUTPUT_TARGET"; then
  echo "[phase6] FAIL: L2 proposer target address missing/zero"
  failures=$((failures+1))
fi
if is_zero_address "$L3_OUTPUT_TARGET"; then
  echo "[phase6] FAIL: L3 proposer target address missing/zero"
  failures=$((failures+1))
fi

L2_CODE=""
L3_CODE=""
L2_VERSION_RAW=""
L3_VERSION_RAW=""

if [[ "$failures" -eq 0 ]]; then
  L2_CODE="$(eth_get_code "$L2_PARENT_RPC" "$L2_OUTPUT_TARGET" || true)"
  if [[ -z "$L2_CODE" || "$L2_CODE" == "0x" ]]; then
    echo "[phase6] FAIL: L2 proposer target has no bytecode on parent RPC"
    failures=$((failures+1))
  fi

  L3_CODE="$(eth_get_code "$L3_PARENT_RPC" "$L3_OUTPUT_TARGET" || true)"
  if [[ -z "$L3_CODE" || "$L3_CODE" == "0x" ]]; then
    echo "[phase6] FAIL: L3 proposer target has no bytecode on parent RPC"
    failures=$((failures+1))
  fi

  if [[ "$L2_MODE" == "output-oracle" ]]; then
    L2_VERSION_RAW="$(eth_call_version "$L2_PARENT_RPC" "$L2_OUTPUT_TARGET" || true)"
    if [[ -z "$L2_VERSION_RAW" || "$L2_VERSION_RAW" == "0x" ]]; then
      echo "[phase6] FAIL: L2 output oracle version() returned empty"
      failures=$((failures+1))
    fi
  fi

  if [[ "$L3_MODE" == "output-oracle" ]]; then
    L3_VERSION_RAW="$(eth_call_version "$L3_PARENT_RPC" "$L3_OUTPUT_TARGET" || true)"
    if [[ -z "$L3_VERSION_RAW" || "$L3_VERSION_RAW" == "0x" ]]; then
      echo "[phase6] FAIL: L3 output oracle version() returned empty"
      failures=$((failures+1))
    fi
  fi
fi

cat <<EOF
{
  "ok": $([[ "$failures" -eq 0 ]] && echo true || echo false),
  "l2": {
    "mode": "$L2_MODE",
    "rollupNodeRpc": "op-proposer --rollup-rpc (compose validated)",
    "parentRpc": "$L2_PARENT_RPC",
    "targetAddress": "$L2_OUTPUT_TARGET",
    "hasCode": $([[ -n "$L2_CODE" && "$L2_CODE" != "0x" ]] && echo true || echo false),
    "versionRaw": "${L2_VERSION_RAW:-}"
  },
  "l3": {
    "mode": "$L3_MODE",
    "rollupNodeRpc": "l3-op-proposer --rollup-rpc (compose validated)",
    "parentRpc": "$L3_PARENT_RPC",
    "targetAddress": "$L3_OUTPUT_TARGET",
    "hasCode": $([[ -n "$L3_CODE" && "$L3_CODE" != "0x" ]] && echo true || echo false),
    "versionRaw": "${L3_VERSION_RAW:-}"
  },
  "failures": $failures
}
EOF

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase6] PASS: proposer configuration gate satisfied"
