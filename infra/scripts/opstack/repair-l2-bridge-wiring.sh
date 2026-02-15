#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/services/stack.env}"
if [ -f "$STACK_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$STACK_ENV_FILE"
  set +a
fi

need_bin() { command -v "$1" >/dev/null 2>&1 || { echo "missing binary: $1" >&2; exit 1; }; }

need_bin cast
need_bin forge
need_bin python3

L1_RPC="${L1_RPC:-${HOST_L1_RPC:-http://localhost:18545}}"
L2_RPC="${L2_RPC:-${HOST_L2_RPC:-http://localhost:29547}}"

L2_PROXY_ADMIN_ADDRESS="${L2_PROXY_ADMIN_ADDRESS:-0x4200000000000000000000000000000000000018}"
L2_XDM_PROXY="${L2_XDM_PROXY:-0x4200000000000000000000000000000000000007}"
L2_STANDARD_BRIDGE_PROXY="${L2_STANDARD_BRIDGE_PROXY:-0x4200000000000000000000000000000000000010}"

DESIRED_L1_XDM="${DESIRED_L1_XDM:-${L1_CROSS_DOMAIN_MESSENGER_ADDRESS:-}}"
DESIRED_L1_BRIDGE="${DESIRED_L1_BRIDGE:-${L1_STANDARD_BRIDGE_ADDRESS:-}}"
if [ -z "$DESIRED_L1_XDM" ] || [ -z "$DESIRED_L1_BRIDGE" ]; then
  echo "missing desired L1 addresses (set L1_CROSS_DOMAIN_MESSENGER_ADDRESS and L1_STANDARD_BRIDGE_ADDRESS in $STACK_ENV_FILE)" >&2
  exit 1
fi

# The ProxyAdmin owner on local dev stacks is typically the 0xf39f... EOA.
# We default to PROPOSER_PRIVATE_KEY because this repo already uses it for dev signing.
ADMIN_OWNER_PRIVATE_KEY="${ADMIN_OWNER_PRIVATE_KEY:-${L2_PROXY_ADMIN_OWNER_PRIVATE_KEY:-${PROPOSER_PRIVATE_KEY:-}}}"
if [ -z "$ADMIN_OWNER_PRIVATE_KEY" ]; then
  echo "missing ADMIN_OWNER_PRIVATE_KEY (or L2_PROXY_ADMIN_OWNER_PRIVATE_KEY / PROPOSER_PRIVATE_KEY)" >&2
  exit 1
fi

slot_hex() {
  python3 - <<'PY' "$1"
import sys
slot = int(sys.argv[1], 10)
print("0x" + format(slot, "064x"))
PY
}

echo "[repair-l2-bridge-wiring] verifying L1 targets have bytecode"
if [ "$(cast code "$DESIRED_L1_XDM" --rpc-url "$L1_RPC")" = "0x" ]; then
  echo "no code at L1_CROSS_DOMAIN_MESSENGER_ADDRESS=$DESIRED_L1_XDM on $L1_RPC" >&2
  exit 1
fi
if [ "$(cast code "$DESIRED_L1_BRIDGE" --rpc-url "$L1_RPC")" = "0x" ]; then
  echo "no code at L1_STANDARD_BRIDGE_ADDRESS=$DESIRED_L1_BRIDGE on $L1_RPC" >&2
  exit 1
fi

current_other_messenger="$(cast call "$L2_XDM_PROXY" "otherMessenger()(address)" --rpc-url "$L2_RPC")"
current_other_bridge="$(cast call "$L2_STANDARD_BRIDGE_PROXY" "otherBridge()(address)" --rpc-url "$L2_RPC")"

echo "[repair-l2-bridge-wiring] L2 CrossDomainMessenger.otherMessenger=$current_other_messenger"
echo "[repair-l2-bridge-wiring] L2 StandardBridge.otherBridge=$current_other_bridge"

if [ "${current_other_messenger,,}" = "${DESIRED_L1_XDM,,}" ] && [ "${current_other_bridge,,}" = "${DESIRED_L1_BRIDGE,,}" ]; then
  echo "[repair-l2-bridge-wiring] OK: already wired"
  exit 0
fi

# Storage slots (validated via eth_getStorageAt scan on this stack):
# - L2CrossDomainMessenger.otherMessenger: slot 207
# - L2StandardBridge.otherBridge:          slot 4
slot_other_messenger="$(slot_hex 207)"
slot_other_bridge="$(slot_hex 4)"

echo "[repair-l2-bridge-wiring] deploying ProxyStorageSetter (dev-only helper)"
setter_addr="$(
  cd "$ROOT_DIR/contracts"
  FOUNDRY_PROFILE=legacy forge create \
    --rpc-url "$L2_RPC" \
    --private-key "$ADMIN_OWNER_PRIVATE_KEY" \
    --broadcast \
    src/dev/ProxyStorageSetter.sol:ProxyStorageSetter \
    --constructor-args "$L2_PROXY_ADMIN_ADDRESS" \
    | awk -F': ' '/Deployed to:/ {print $2}'
)"
if [ -z "$setter_addr" ]; then
  echo "failed to deploy ProxyStorageSetter" >&2
  exit 1
fi
echo "[repair-l2-bridge-wiring] ProxyStorageSetter deployed at $setter_addr"

orig_xdm_impl="$(cast call "$L2_XDM_PROXY" "implementation()(address)" --rpc-url "$L2_RPC")"
orig_bridge_impl="$(cast call "$L2_STANDARD_BRIDGE_PROXY" "implementation()(address)" --rpc-url "$L2_RPC")"

echo "[repair-l2-bridge-wiring] original implementations:"
echo "  L2_XDM implementation: $orig_xdm_impl"
echo "  L2_BRIDGE implementation: $orig_bridge_impl"

echo "[repair-l2-bridge-wiring] patching L2 CrossDomainMessenger.otherMessenger"
xdm_data="$(cast calldata "setAddress(bytes32,address)" "$slot_other_messenger" "$DESIRED_L1_XDM")"
cast send "$L2_PROXY_ADMIN_ADDRESS" \
  "upgradeAndCall(address,address,bytes)" \
  "$L2_XDM_PROXY" \
  "$setter_addr" \
  "$xdm_data" \
  --rpc-url "$L2_RPC" \
  --private-key "$ADMIN_OWNER_PRIVATE_KEY" >/dev/null
cast send "$L2_PROXY_ADMIN_ADDRESS" \
  "upgrade(address,address)" \
  "$L2_XDM_PROXY" \
  "$orig_xdm_impl" \
  --rpc-url "$L2_RPC" \
  --private-key "$ADMIN_OWNER_PRIVATE_KEY" >/dev/null

echo "[repair-l2-bridge-wiring] patching L2 StandardBridge.otherBridge"
bridge_data="$(cast calldata "setAddress(bytes32,address)" "$slot_other_bridge" "$DESIRED_L1_BRIDGE")"
cast send "$L2_PROXY_ADMIN_ADDRESS" \
  "upgradeAndCall(address,address,bytes)" \
  "$L2_STANDARD_BRIDGE_PROXY" \
  "$setter_addr" \
  "$bridge_data" \
  --rpc-url "$L2_RPC" \
  --private-key "$ADMIN_OWNER_PRIVATE_KEY" >/dev/null
cast send "$L2_PROXY_ADMIN_ADDRESS" \
  "upgrade(address,address)" \
  "$L2_STANDARD_BRIDGE_PROXY" \
  "$orig_bridge_impl" \
  --rpc-url "$L2_RPC" \
  --private-key "$ADMIN_OWNER_PRIVATE_KEY" >/dev/null

new_other_messenger="$(cast call "$L2_XDM_PROXY" "otherMessenger()(address)" --rpc-url "$L2_RPC")"
new_other_bridge="$(cast call "$L2_STANDARD_BRIDGE_PROXY" "otherBridge()(address)" --rpc-url "$L2_RPC")"

echo "[repair-l2-bridge-wiring] updated wiring:"
echo "  L2 CrossDomainMessenger.otherMessenger=$new_other_messenger"
echo "  L2 StandardBridge.otherBridge=$new_other_bridge"

if [ "${new_other_messenger,,}" != "${DESIRED_L1_XDM,,}" ]; then
  echo "failed to update L2 CrossDomainMessenger wiring (wanted $DESIRED_L1_XDM)" >&2
  exit 1
fi
if [ "${new_other_bridge,,}" != "${DESIRED_L1_BRIDGE,,}" ]; then
  echo "failed to update L2 StandardBridge wiring (wanted $DESIRED_L1_BRIDGE)" >&2
  exit 1
fi

echo "[repair-l2-bridge-wiring] OK"
