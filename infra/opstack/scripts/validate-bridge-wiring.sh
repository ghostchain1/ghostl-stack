#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OPSTACK_DIR="$ROOT_DIR/infra/opstack"
ENV_L2="${PHASE8_ENV_L2:-$OPSTACK_DIR/.env}"
ENV_L3="${PHASE8_ENV_L3:-$OPSTACK_DIR/.env.l3}"

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

L1_RPC="${PHASE8_L1_RPC:-${HOST_L1_RPC:-${L1_RPC:-http://localhost:18545}}}"
L2_RPC="${PHASE8_L2_RPC:-${HOST_L2_RPC:-${L2_RPC:-http://localhost:29547}}}"
L3_RPC="${PHASE8_L3_RPC:-${HOST_L3_RPC:-${L3_RPC:-http://localhost:39545}}}"

L2_STANDARD_BRIDGE="${L2_STANDARD_BRIDGE_ADDRESS:-0x4200000000000000000000000000000000000010}"
L3_STANDARD_BRIDGE="${L3_STANDARD_BRIDGE_ADDRESS:-0x4200000000000000000000000000000000000010}"
L1_STANDARD_BRIDGE="${L1_STANDARD_BRIDGE_ADDRESS:-}"

L2_MESSENGER="${L2_CROSS_DOMAIN_MESSENGER_ADDRESS:-0x4200000000000000000000000000000000000007}"
L3_MESSENGER="${L3_CROSS_DOMAIN_MESSENGER_ADDRESS:-0x4200000000000000000000000000000000000007}"
L1_MESSENGER="${L1_CROSS_DOMAIN_MESSENGER_ADDRESS:-}"

EXPECTED_L3_PARENT_BRIDGE="${L3_PARENT_STANDARD_BRIDGE_ADDRESS:-}"
EXPECTED_L3_PARENT_MESSENGER="${L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS:-}"
EXPECTED_L2_PARENT_BRIDGE="${L1_STANDARD_BRIDGE_ADDRESS:-}"
EXPECTED_PORTAL="${OPTIMISM_PORTAL_ADDRESS:-${L2_PORTAL_ADDRESS:-}}"

is_zero_address() {
  local value="${1:-}"
  [[ -z "$value" || "$value" =~ ^0x0{40}$ ]]
}

to_checksum_or_empty() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo ""
    return
  fi
  node -e 'const v=process.argv[1]; try { const {ethers}=require("ethers"); console.log(ethers.getAddress(v)); } catch { process.exit(1); }' "$value" 2>/dev/null || echo ""
}

rpc_call() {
  local rpc_url="$1"
  local payload="$2"
  curl -sS --fail --max-time 8 -H 'content-type: application/json' --data "$payload" "$rpc_url"
}

eth_call_raw() {
  local rpc_url="$1"
  local to_addr="$2"
  local data="$3"
  local body
  body="$(rpc_call "$rpc_url" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$to_addr\",\"data\":\"$data\"},\"latest\"]}")"
  node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(0,"utf8"));if(x.error){process.exit(2)} console.log(x.result||"")' <<<"$body"
}

decode_address_result() {
  local raw="${1:-}"
  node -e 'const x=(process.argv[1]||"").toLowerCase(); if(!x.startsWith("0x")||x.length<66){process.exit(1)} const hex=x.slice(-40); if(!/^[0-9a-f]{40}$/.test(hex)){process.exit(1)} console.log("0x"+hex);' "$raw" 2>/dev/null || true
}

decode_uint_result() {
  local raw="${1:-}"
  node -e 'const x=process.argv[1]||""; if(!x.startsWith("0x")||x.length<3){process.exit(1)} console.log(BigInt(x).toString());' "$raw" 2>/dev/null || true
}

call_address_fn() {
  local rpc_url="$1"
  local contract="$2"
  shift 2
  local selectors=("$@")
  for selector in "${selectors[@]}"; do
    local raw
    raw="$(eth_call_raw "$rpc_url" "$contract" "$selector" 2>/dev/null || true)"
    local addr
    addr="$(decode_address_result "$raw")"
    if [[ -n "$addr" ]]; then
      to_checksum_or_empty "$addr"
      return 0
    fi
  done
  echo ""
}

call_uint_fn() {
  local rpc_url="$1"
  local contract="$2"
  local selector="$3"
  local raw
  raw="$(eth_call_raw "$rpc_url" "$contract" "$selector" 2>/dev/null || true)"
  decode_uint_result "$raw"
}

failures=0

L2_STANDARD_BRIDGE="$(to_checksum_or_empty "$L2_STANDARD_BRIDGE")"
L3_STANDARD_BRIDGE="$(to_checksum_or_empty "$L3_STANDARD_BRIDGE")"
L1_STANDARD_BRIDGE="$(to_checksum_or_empty "$L1_STANDARD_BRIDGE")"
L2_MESSENGER="$(to_checksum_or_empty "$L2_MESSENGER")"
L3_MESSENGER="$(to_checksum_or_empty "$L3_MESSENGER")"
L1_MESSENGER="$(to_checksum_or_empty "$L1_MESSENGER")"
EXPECTED_L3_PARENT_BRIDGE="$(to_checksum_or_empty "$EXPECTED_L3_PARENT_BRIDGE")"
EXPECTED_L3_PARENT_MESSENGER="$(to_checksum_or_empty "$EXPECTED_L3_PARENT_MESSENGER")"
EXPECTED_L2_PARENT_BRIDGE="$(to_checksum_or_empty "$EXPECTED_L2_PARENT_BRIDGE")"
EXPECTED_PORTAL="$(to_checksum_or_empty "$EXPECTED_PORTAL")"

if [[ -z "$L1_STANDARD_BRIDGE" || -z "$L1_MESSENGER" || -z "$EXPECTED_PORTAL" ]]; then
  echo "[phase8] FAIL: missing L2->L1 env bridge/messenger/portal addresses"
  failures=$((failures+1))
fi
if [[ -z "$EXPECTED_L3_PARENT_BRIDGE" || -z "$EXPECTED_L3_PARENT_MESSENGER" ]]; then
  echo "[phase8] FAIL: missing L3 parent bridge/messenger env addresses"
  failures=$((failures+1))
fi

# L3 -> L2 checks
L3_BRIDGE_OTHER="$(call_address_fn "$L3_RPC" "$L3_STANDARD_BRIDGE" "0x7f46ddb2" "0xc89701a2")"
L3_BRIDGE_MESSENGER="$(call_address_fn "$L3_RPC" "$L3_STANDARD_BRIDGE" "0x927ede2d" "0x3cb747bf")"
L3_MESSENGER_OTHER="$(call_address_fn "$L3_RPC" "$L3_MESSENGER" "0x9fce812c" "0xdb505d80")"

if [[ -z "$L3_BRIDGE_OTHER" || "$L3_BRIDGE_OTHER" != "$EXPECTED_L3_PARENT_BRIDGE" ]]; then
  echo "[phase8] FAIL: L3StandardBridge other bridge mismatch"
  failures=$((failures+1))
fi
if [[ -z "$L3_BRIDGE_MESSENGER" || "$L3_BRIDGE_MESSENGER" != "$L3_MESSENGER" ]]; then
  echo "[phase8] FAIL: L3StandardBridge messenger mismatch"
  failures=$((failures+1))
fi
if [[ -z "$L3_MESSENGER_OTHER" || "$L3_MESSENGER_OTHER" != "$EXPECTED_L3_PARENT_MESSENGER" ]]; then
  echo "[phase8] FAIL: L3 messenger parent messenger mismatch"
  failures=$((failures+1))
fi

MIN_GAS_CALLDATA_OVERHEAD="$(call_uint_fn "$L3_RPC" "$L3_MESSENGER" "0x028f85f7")"
MIN_GAS_DENOM="$(call_uint_fn "$L3_RPC" "$L3_MESSENGER" "0x0c568498")"
MIN_GAS_NUM="$(call_uint_fn "$L3_RPC" "$L3_MESSENGER" "0x2828d7e8")"

if [[ -z "$MIN_GAS_CALLDATA_OVERHEAD" || -z "$MIN_GAS_DENOM" || -z "$MIN_GAS_NUM" ]]; then
  echo "[phase8] FAIL: unable to read L3 messenger gas-limit constants"
  failures=$((failures+1))
else
  if (( MIN_GAS_CALLDATA_OVERHEAD <= 0 )); then
    echo "[phase8] FAIL: MIN_GAS_CALLDATA_OVERHEAD not positive"
    failures=$((failures+1))
  fi
  if (( MIN_GAS_DENOM <= 0 )); then
    echo "[phase8] FAIL: MIN_GAS_DYNAMIC_OVERHEAD_DENOMINATOR not positive"
    failures=$((failures+1))
  fi
  if (( MIN_GAS_NUM <= 0 || MIN_GAS_NUM > MIN_GAS_DENOM * 1000 )); then
    echo "[phase8] FAIL: MIN_GAS_DYNAMIC_OVERHEAD_NUMERATOR out of bounds"
    failures=$((failures+1))
  fi
fi

# L2 -> L1 checks
L2_BRIDGE_OTHER="$(call_address_fn "$L2_RPC" "$L2_STANDARD_BRIDGE" "0x7f46ddb2" "0xc89701a2")"
L1_MESSENGER_PORTAL="$(call_address_fn "$L1_RPC" "$L1_MESSENGER" "0x0ff754ea" "0x6425666b")"

if [[ -z "$L2_BRIDGE_OTHER" || "$L2_BRIDGE_OTHER" != "$EXPECTED_L2_PARENT_BRIDGE" ]]; then
  echo "[phase8] FAIL: L2StandardBridge other bridge mismatch"
  failures=$((failures+1))
fi
if [[ -z "$L1_MESSENGER_PORTAL" || "$L1_MESSENGER_PORTAL" != "$EXPECTED_PORTAL" ]]; then
  echo "[phase8] FAIL: L1 messenger portal mismatch"
  failures=$((failures+1))
fi

cat <<EOF
{
  "ok": $([[ "$failures" -eq 0 ]] && echo true || echo false),
  "l3ToL2": {
    "l3StandardBridge": "$L3_STANDARD_BRIDGE",
    "expectedParentBridge": "$EXPECTED_L3_PARENT_BRIDGE",
    "actualParentBridge": "$L3_BRIDGE_OTHER",
    "expectedMessenger": "$L3_MESSENGER",
    "actualMessenger": "$L3_BRIDGE_MESSENGER",
    "expectedParentMessenger": "$EXPECTED_L3_PARENT_MESSENGER",
    "actualParentMessenger": "$L3_MESSENGER_OTHER",
    "gas": {
      "minCalldataOverhead": "${MIN_GAS_CALLDATA_OVERHEAD:-}",
      "minDynamicOverheadDenominator": "${MIN_GAS_DENOM:-}",
      "minDynamicOverheadNumerator": "${MIN_GAS_NUM:-}"
    }
  },
  "l2ToL1": {
    "l2StandardBridge": "$L2_STANDARD_BRIDGE",
    "expectedParentBridge": "$EXPECTED_L2_PARENT_BRIDGE",
    "actualParentBridge": "$L2_BRIDGE_OTHER",
    "l1Messenger": "$L1_MESSENGER",
    "expectedPortal": "$EXPECTED_PORTAL",
    "actualPortal": "$L1_MESSENGER_PORTAL"
  },
  "rpc": {
    "l1": "$L1_RPC",
    "l2": "$L2_RPC",
    "l3": "$L3_RPC"
  },
  "failures": $failures
}
EOF

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase8] PASS: bridge wiring gate satisfied"
