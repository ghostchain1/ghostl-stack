#!/usr/bin/env bash
# OP Stack L3-on-L2 preflight: validates RPCs, chain IDs, and output oracles for L3→L2 and L2→L1.
#
# Usage:
#   bash infra/scripts/opstack/preflight-3layer.sh [env-file ...]
# If no env files are provided, the script will try: infra/opstack/.env and infra/opstack/.env.l3
#
# Requires: bash, jq, curl, cast (foundry).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

color() {
  if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    tput setaf "$1"
  fi
}

reset_color() {
  if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    tput sgr0
  fi
}

RESET="$(reset_color || true)"
GREEN="$(color 2 || true)"
YELLOW="$(color 3 || true)"
RED="$(color 1 || true)"

pass() { echo "${GREEN}✔${RESET} $1"; }
warn() { echo "${YELLOW}⚠${RESET} $1"; }
fail() { echo "${RED}✖${RESET} $1"; FAILED=1; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

resolve_first() {
  for var in "$@"; do
    val="${!var:-}"
    if [ -n "$val" ]; then
      echo "$val"
      return 0
    fi
  done
  return 1
}

ENV_FILES=()
if [ "$#" -gt 0 ]; then
  ENV_FILES=("$@")
else
  [[ -f "$REPO_ROOT/infra/opstack/.env" ]] && ENV_FILES+=("$REPO_ROOT/infra/opstack/.env")
  [[ -f "$REPO_ROOT/infra/opstack/.env.l3" ]] && ENV_FILES+=("$REPO_ROOT/infra/opstack/.env.l3")
fi

if [ "${#ENV_FILES[@]}" -eq 0 ]; then
  echo "usage: preflight-3layer.sh [env-file ...]" >&2
  exit 1
fi

for f in "${ENV_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "env file not found: $f" >&2
    exit 1
  fi
done

need_cmd jq
need_cmd curl
need_cmd cast

FAILED=0

set -a
for f in "${ENV_FILES[@]}"; do
  # shellcheck source=/dev/null
  source "$f"
done
set +a

L1_RPC=$(resolve_first L1_RPC HOST_L1_RPC PARENT_L1_RPC) || { echo "L1_RPC not set (use L1_RPC or HOST_L1_RPC)"; exit 1; }
L2_RPC=$(resolve_first L2_RPC HOST_L2_RPC PARENT_L2_RPC) || { echo "L2_RPC not set (use L2_RPC or HOST_L2_RPC)"; exit 1; }
L3_RPC=$(resolve_first L3_RPC HOST_L3_RPC ROLLUP_NODE_RPC) || { echo "L3_RPC not set (use L3_RPC or HOST_L3_RPC)"; exit 1; }

L1_CHAIN_EXPECTED=$(resolve_first L1_CHAIN_ID)
L2_CHAIN_EXPECTED=$(resolve_first L2_CHAIN_ID PARENT_L2_CHAIN_ID OP_L2_CHAIN_ID)
L3_CHAIN_EXPECTED=$(resolve_first L3_CHAIN_ID OP_L3_CHAIN_ID)

L2_ORACLE=$(resolve_first L2_OUTPUT_ORACLE_ADDRESS OUTPUT_ORACLE_ADDRESS L2OO_ADDRESS)
L3_ORACLE=$(resolve_first L3_OUTPUT_ORACLE_ADDRESS L3_L2OO_ADDRESS)

L2_PORTAL=$(resolve_first L2_PORTAL_ADDRESS OPTIMISM_PORTAL_ADDRESS PORTAL_ADDRESS)
L2_SYSTEM_CONFIG=$(resolve_first L2_SYSTEM_CONFIG_ADDRESS SYSTEM_CONFIG_ADDRESS L1_SYSTEM_CONFIG_ADDRESS)
L2_GAME_FACTORY=$(resolve_first L2_GAME_FACTORY_ADDRESS GAME_FACTORY_ADDRESS)
L2_BRIDGE_L1=$(resolve_first L1_STANDARD_BRIDGE_ADDRESS L2_L1_STANDARD_BRIDGE_ADDRESS)
L2_BRIDGE_L2=$(resolve_first L2_STANDARD_BRIDGE_ADDRESS)

L3_PORTAL=$(resolve_first L3_PORTAL_ADDRESS)
L3_SYSTEM_CONFIG=$(resolve_first L3_SYSTEM_CONFIG_ADDRESS)
L3_GAME_FACTORY=$(resolve_first L3_DISPUTE_GAME_FACTORY_ADDRESS L3_GAME_FACTORY_ADDRESS)
L3_BRIDGE_L2=$(resolve_first L3_L2_STANDARD_BRIDGE_ADDRESS L3_PARENT_STANDARD_BRIDGE_ADDRESS)
L3_BRIDGE_L3=$(resolve_first L3_STANDARD_BRIDGE_ADDRESS)

L3_NAME_VAR="${L3_NAME:-ghostl3}"

echo "Preflight: sourcing ${ENV_FILES[*]}"
echo "RPCs: L1=$L1_RPC  L2=$L2_RPC  L3=$L3_RPC"

get_chain_id() {
  local label="$1" url="$2" expected="$3"
  local id
  if ! id=$(cast chain-id --rpc-url "$url" 2>/dev/null); then
    fail "$label: unable to fetch chain id from $url"
    echo ""
    return 1
  fi
  if [ -n "$expected" ] && [ "$id" != "$expected" ]; then
    fail "$label chain-id mismatch (expected $expected, got $id)"
  else
    pass "$label chain-id = $id"
  fi
  echo "$id"
  return 0
}

check_oracle() {
  local label="$1" addr="$2" parent_rpc="$3"
  if [ -z "$addr" ]; then
    fail "$label oracle address not provided"
    return
  fi
  if [[ "$addr" =~ ^0x0+$ ]]; then
    fail "$label oracle address is zero"
    return
  fi
  if ! code=$(cast code "$addr" --rpc-url "$parent_rpc" 2>/dev/null); then
    fail "$label oracle: unable to fetch code from parent RPC"
    return
  fi
  if [ "$code" = "0x" ] || [ "$code" = "0x0" ]; then
    fail "$label oracle: no bytecode at $addr on parent RPC"
    return
  fi
  if ! ver=$(cast call "$addr" "version()(string)" --rpc-url "$parent_rpc" 2>/dev/null); then
    fail "$label oracle: version() call failed (ABI mismatch or wrong chain)"
    return
  fi
  pass "$label oracle ok (version: $ver)"
}

check_contract() {
  local label="$1" addr="$2" rpc="$3"
  if [ -z "$addr" ]; then
    return
  fi
  if [[ "$addr" =~ ^0x0+$ ]]; then
    fail "$label address is zero"
    return
  fi
  if ! code=$(cast code "$addr" --rpc-url "$rpc" 2>/dev/null); then
    fail "$label: unable to fetch code from $rpc"
    return
  fi
  if [ "$code" = "0x" ] || [ "$code" = "0x0" ]; then
    fail "$label: no bytecode at $addr on $rpc"
    return
  fi
  pass "$label ok"
}

check_datadir() {
  local label="$1" dir="$2"
  if [ ! -d "$dir" ]; then
    warn "$label missing (ok if not initialized yet)"
    return
  fi
  if [ "$(find "$dir" -mindepth 1 -print -quit 2>/dev/null)" ]; then
    warn "$label not empty (if reconfiguring, clear stale data: rm -rf \"$dir\")"
  else
    pass "$label empty (fresh)"
  fi
}

echo "---- Chain ID checks ----"
L1_ID=$(get_chain_id "L1" "$L1_RPC" "${L1_CHAIN_EXPECTED:-}") || true
L2_ID=$(get_chain_id "L2" "$L2_RPC" "${L2_CHAIN_EXPECTED:-}") || true
L3_ID=$(get_chain_id "L3" "$L3_RPC" "${L3_CHAIN_EXPECTED:-}") || true

if [ -n "$L1_ID" ] && [ -n "$L2_ID" ] && [ -n "$L3_ID" ]; then
  if [ "$L1_ID" = "$L2_ID" ] || [ "$L1_ID" = "$L3_ID" ] || [ "$L2_ID" = "$L3_ID" ]; then
    fail "chain ids are not unique (L1=$L1_ID, L2=$L2_ID, L3=$L3_ID)"
  else
    pass "chain ids are unique across L1/L2/L3"
  fi
fi

echo "---- Oracle checks ----"
check_oracle "L2→L1 OutputOracle" "$L2_ORACLE" "$L1_RPC"
check_oracle "L3→L2 OutputOracle" "$L3_ORACLE" "$L2_RPC"

echo "---- Portal / SystemConfig / Bridge checks ----"
check_contract "L2 portal (OptimismPortal on L1)" "$L2_PORTAL" "$L1_RPC"
check_contract "L2 SystemConfig (on L1)" "$L2_SYSTEM_CONFIG" "$L1_RPC"
check_contract "L2 game factory (on L1)" "$L2_GAME_FACTORY" "$L1_RPC"
check_contract "L2 StandardBridge (L1 side)" "$L2_BRIDGE_L1" "$L1_RPC"
check_contract "L2 StandardBridge (L2 side)" "$L2_BRIDGE_L2" "$L2_RPC"

check_contract "L3 portal (OptimismPortal on L2)" "$L3_PORTAL" "$L2_RPC"
check_contract "L3 SystemConfig (on L2)" "$L3_SYSTEM_CONFIG" "$L2_RPC"
check_contract "L3 game factory (on L2)" "$L3_GAME_FACTORY" "$L2_RPC"
check_contract "L3 StandardBridge (L2 side)" "$L3_BRIDGE_L2" "$L2_RPC"
check_contract "L3 StandardBridge (L3 side)" "$L3_BRIDGE_L3" "$L3_RPC"

echo "---- Data dir hygiene ----"
check_datadir "L2 geth data (infra/opstack/data/l2-geth-new)" "$REPO_ROOT/infra/opstack/data/l2-geth-new"
check_datadir "L2 op-node data (infra/opstack/data/op-node)" "$REPO_ROOT/infra/opstack/data/op-node"
check_datadir "L3 geth data (infra/opstack/l3/${L3_NAME_VAR}/data)" "$REPO_ROOT/infra/opstack/l3/${L3_NAME_VAR}/data"

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "Preflight FAILED"
  exit 1
fi

echo
echo "Preflight PASSED"
