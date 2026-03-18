#!/usr/bin/env bash
set -euo pipefail

# Foundry tooling (forge/cast) is typically installed via foundryup into $HOME/.foundry/bin.
export PATH="$HOME/.foundry/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

L3_NAME="${L3_NAME:-ghostl3}"
L3_DIR="$OP_DIR/l3/$L3_NAME"
ENV_FILE="$OP_DIR/.env"
ENV_L3_FILE="$OP_DIR/.env.l3"
ROLLUP_JSON="$L3_DIR/config/rollup.json"
GENESIS_JSON="$L3_DIR/config/genesis.json"
DEPLOY_CFG="$OP_DIR/config/deploy-config.l3.json"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd forge
need_cmd jq
need_cmd curl
need_cmd perl

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (copy infra/opstack/.env.sample first)" >&2
  exit 1
fi

if [ ! -f "$ROLLUP_JSON" ] || [ ! -f "$GENESIS_JSON" ]; then
  echo "Missing L3 config under $L3_DIR (run infra/scripts/opstack/l3/new.sh first)" >&2
  exit 1
fi

# Preserve caller-provided RPC overrides before sourcing .env.
HOST_L2_RPC_OVERRIDE="${HOST_L2_RPC:-}"
HOST_L3_RPC_OVERRIDE="${HOST_L3_RPC:-}"
L2_CHAIN_ID_OVERRIDE="${L2_CHAIN_ID:-}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
[ -f "$OP_DIR/.env.secrets" ] && source "$OP_DIR/.env.secrets"
# Load L3-specific addresses if available; these are used for preflight checks.
[ -f "$ENV_L3_FILE" ] && source "$ENV_L3_FILE"
[ -f "$L3_DIR/.env" ] && source "$L3_DIR/.env"
set +a

# Re-apply explicit overrides so callers can point at alternative RPCs.
[ -n "$HOST_L2_RPC_OVERRIDE" ] && HOST_L2_RPC="$HOST_L2_RPC_OVERRIDE"
[ -n "$HOST_L3_RPC_OVERRIDE" ] && HOST_L3_RPC="$HOST_L3_RPC_OVERRIDE"
[ -n "$L2_CHAIN_ID_OVERRIDE" ] && L2_CHAIN_ID="$L2_CHAIN_ID_OVERRIDE"

HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
L2_CHAIN_ID="${L2_CHAIN_ID:-901}"
CANONICAL_GAS_TOKEN_EXPECTED="0x5FbDB2315678afecb367f032d93F642f64180aa3"
for var in CANONICAL_GAS_TOKEN CUSTOM_GAS_TOKEN_ADDRESS CUSTOM_GAS_TOKEN_ADDRESS_L3 GAS_TOKEN_ADDRESS GAS_TOKEN_ADDRESS_L2 GAS_TOKEN_ADDRESS_L3; do
  val="${!var:-}"
  if [ -n "$val" ] && [ "${val,,}" != "${CANONICAL_GAS_TOKEN_EXPECTED,,}" ]; then
    echo "$var must equal canonical gas token ($CANONICAL_GAS_TOKEN_EXPECTED); got $val" >&2
    exit 1
  fi
done
CANONICAL_GAS_TOKEN="$CANONICAL_GAS_TOKEN_EXPECTED"

if ! curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
  echo "L2 RPC not responding at $HOST_L2_RPC" >&2
  exit 1
fi

has_code() {
  local addr="$1"
  if [[ ! "$addr" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    return 1
  fi
  local code
  code="$(curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"]}" \
    | jq -r '.result' 2>/dev/null || true)"
  [ -n "$code" ] && [ "$code" != "0x" ] && [ "$code" != "null" ]
}

if [ "${FORCE_DEPLOY_L3:-0}" != "1" ]; then
  existing_sys="$(jq -r '.l1_system_config_address // empty' "$ROLLUP_JSON")"
  existing_portal="$(jq -r '.deposit_contract_address // empty' "$ROLLUP_JSON")"
  existing_pv="$(jq -r '.protocol_versions_address // empty' "$ROLLUP_JSON")"
  existing_l2oo="${L3_L2OO_ADDRESS:-${L3_OUTPUT_ORACLE_ADDRESS:-}}"
  existing_dgf="${L3_DISPUTE_GAME_FACTORY_ADDRESS:-${L3_GAME_FACTORY_ADDRESS:-}}"
  existing_std="${L3_PARENT_STANDARD_BRIDGE_ADDRESS:-${L3_L2_STANDARD_BRIDGE_ADDRESS:-}}"
  existing_cdm="${L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS:-}"

  missing=()
  has_code "$existing_sys" || missing+=("SystemConfig:$existing_sys")
  has_code "$existing_portal" || missing+=("OptimismPortal:$existing_portal")
  has_code "$existing_pv" || missing+=("ProtocolVersions:$existing_pv")
  has_code "$existing_l2oo" || missing+=("L2OutputOracle:$existing_l2oo")
  has_code "$existing_dgf" || missing+=("DisputeGameFactory:$existing_dgf")
  has_code "$existing_std" || missing+=("L1StandardBridge:$existing_std")
  has_code "$existing_cdm" || missing+=("L1CrossDomainMessenger:$existing_cdm")

  if [ "${#missing[@]}" -eq 0 ]; then
    echo "L3 parent contracts already deployed on L2 (set FORCE_DEPLOY_L3=1 to redeploy)."
    exit 0
  fi

  echo "Missing or code-less parent contracts detected; will deploy: ${missing[*]}"
fi

: "${DEPLOYER_PRIVATE_KEY:?missing DEPLOYER_PRIVATE_KEY in $ENV_FILE}"
: "${BATCH_SENDER_ADDRESS:?missing BATCH_SENDER_ADDRESS in $ENV_FILE}"
: "${SEQUENCER_ADDRESS:?missing SEQUENCER_ADDRESS in $ENV_FILE}"
: "${PROPOSER_ADDRESS:?missing PROPOSER_ADDRESS in $ENV_FILE}"
: "${CHALLENGER_ADDRESS:?missing CHALLENGER_ADDRESS in $ENV_FILE}"

l3_chain_id="$(jq -r '.config.chainId // empty' "$GENESIS_JSON")"
l3_block_time="$(jq -r '.block_time // empty' "$ROLLUP_JSON")"
l3_genesis_hex="$(jq -r '.timestamp // empty' "$GENESIS_JSON")"
l3_genesis_block="$(jq -r '.genesis.l2.number // empty' "$ROLLUP_JSON")"
batch_inbox="$(jq -r '.batch_inbox_address // empty' "$ROLLUP_JSON")"

if [ -z "$l3_block_time" ] || [ "$l3_block_time" = "null" ]; then
  l3_block_time=2
fi

if [ -n "$l3_genesis_hex" ] && [ "$l3_genesis_hex" != "null" ]; then
  l3_genesis_ts=$((16#${l3_genesis_hex#0x}))
else
  l3_genesis_ts="$(jq -r '.genesis.l2_time // 0' "$ROLLUP_JSON")"
fi

if [ -z "$l3_genesis_block" ] || [ "$l3_genesis_block" = "null" ]; then
  l3_genesis_block=0
fi

if [ -z "$batch_inbox" ] || [ "$batch_inbox" = "null" ]; then
  batch_inbox="${BATCH_INBOX_ADDRESS:-0x0000000000000000000000000000000000000000}"
fi

l2_latest_hex="$(curl -fsS -X POST "$HOST_L2_RPC" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}' \
  | jq -r '.result.timestamp')"
if [ -n "$l2_latest_hex" ] && [ "$l2_latest_hex" != "null" ]; then
  l2_latest_ts=$((16#${l2_latest_hex#0x}))
  if [ "$l3_genesis_ts" -ge "$l2_latest_ts" ]; then
    l3_genesis_ts=$((l2_latest_ts - 1))
    tmp_genesis="$(mktemp)"
    jq --arg ts "$(printf '0x%x' "$l3_genesis_ts")" '.timestamp = $ts' "$GENESIS_JSON" >"$tmp_genesis" && mv "$tmp_genesis" "$GENESIS_JSON"
    tmp_rollup_ts="$(mktemp)"
    jq --argjson ts "$l3_genesis_ts" '.genesis.l2_time = $ts' "$ROLLUP_JSON" >"$tmp_rollup_ts" && mv "$tmp_rollup_ts" "$ROLLUP_JSON"
    echo "Adjusted L3 genesis timestamp to $l3_genesis_ts to satisfy L2OutputOracle constraints."
  fi
fi

export DEPLOYER_PK="$DEPLOYER_PRIVATE_KEY"
export BATCH_SENDER_ADDRESS
export SEQUENCER_ADDRESS
export PROPOSER_ADDRESS
export CHALLENGER_ADDRESS
export L2_BLOCK_TIME="$l3_block_time"
export L2_GENESIS_TIMESTAMP="$l3_genesis_ts"
export L2_GENESIS_BLOCK_NUMBER="$l3_genesis_block"
export BATCH_INBOX_ADDRESS="$batch_inbox"
export USE_CUSTOM_GAS_TOKEN="true"
export CUSTOM_GAS_TOKEN_ADDRESS="$CANONICAL_GAS_TOKEN"

if [ "${USE_CUSTOM_GAS_TOKEN,,}" != "true" ]; then
  echo "Custom gas token is required; refusing non-GST gas fallback." >&2
  exit 1
fi

if [ "${CUSTOM_GAS_TOKEN_ADDRESS,,}" != "${CANONICAL_GAS_TOKEN,,}" ]; then
  echo "Gas token must be canonical ($CANONICAL_GAS_TOKEN); got $CUSTOM_GAS_TOKEN_ADDRESS" >&2
  exit 1
fi

deploy_json="$(mktemp)"
(
  cd "$ROOT/contracts"
  ROOT_DIR="$ROOT" \
  OUTPUT_FILE="$deploy_json" \
  OUTPUT_DIR="$(dirname "$deploy_json")" \
  RPC_L2="$HOST_L2_RPC" \
  L2_CHAIN_ID="$L2_CHAIN_ID" \
  DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
  L3_PARENT_DEPLOYER_PRIVATE_KEY="${L3_PARENT_DEPLOYER_PRIVATE_KEY:-}" \
  BATCH_SENDER_ADDRESS="$BATCH_SENDER_ADDRESS" \
  SEQUENCER_ADDRESS="$SEQUENCER_ADDRESS" \
  PROPOSER_ADDRESS="$PROPOSER_ADDRESS" \
  CHALLENGER_ADDRESS="$CHALLENGER_ADDRESS" \
  BATCH_INBOX_ADDRESS="$batch_inbox" \
  CANONICAL_GAS_TOKEN="$CANONICAL_GAS_TOKEN" \
  ./node_modules/.bin/tsx scripts/deploy_l3_parent_on_l2.ts
)

portal="$(jq -r '.OptimismPortalProxy // .portal // empty' "$deploy_json")"
system_config="$(jq -r '.SystemConfigProxy // .systemConfig // empty' "$deploy_json")"
protocol_versions="$(jq -r '.ProtocolVersionsProxy // .protocolVersions // empty' "$deploy_json")"
l1_cdm="$(jq -r '.L1CrossDomainMessengerProxy // .l1CrossDomainMessenger // empty' "$deploy_json")"
l1_std_bridge="$(jq -r '.L1StandardBridgeProxy // .l1StandardBridge // empty' "$deploy_json")"
l2oo="$(jq -r '.L2OutputOracleProxy // .l2OutputOracle // empty' "$deploy_json")"
dgf="$(jq -r '.DisputeGameFactoryProxy // .disputeGameFactory // empty' "$deploy_json")"

for label in protocol_versions system_config portal l1_cdm l1_std_bridge l2oo dgf; do
  if [ -z "${!label}" ] || [ "${!label}" = "null" ]; then
    echo "Missing $label from deploy output ($deploy_json)" >&2
    exit 1
  fi
done

tmp_rollup="$(mktemp)"
jq --arg portal "$portal" --arg sys "$system_config" --arg pv "$protocol_versions" \
  '.deposit_contract_address = $portal
   | .l1_system_config_address = $sys
   | .protocol_versions_address = $pv' \
  "$ROLLUP_JSON" >"$tmp_rollup" && mv "$tmp_rollup" "$ROLLUP_JSON"

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ ("^" key "=") { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$file" >"$tmp" && mv "$tmp" "$file"
}

upsert_env PARENT_L2_RPC "$HOST_L2_RPC" "$ENV_L3_FILE"
upsert_env PARENT_L2_CHAIN_ID "$L2_CHAIN_ID" "$ENV_L3_FILE"
upsert_env L3_RPC "$HOST_L3_RPC" "$ENV_L3_FILE"
upsert_env L3_CHAIN_ID "$l3_chain_id" "$ENV_L3_FILE"
upsert_env L3_PORTAL_ADDRESS "$portal" "$ENV_L3_FILE"
upsert_env L3_SYSTEM_CONFIG_ADDRESS "$system_config" "$ENV_L3_FILE"
upsert_env L3_DISPUTE_GAME_FACTORY_ADDRESS "$dgf" "$ENV_L3_FILE"
upsert_env L3_L2OO_ADDRESS "$l2oo" "$ENV_L3_FILE"
upsert_env L3_PARENT_STANDARD_BRIDGE_ADDRESS "$l1_std_bridge" "$ENV_L3_FILE"
upsert_env L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS "$l1_cdm" "$ENV_L3_FILE"
upsert_env L3_GAME_FACTORY_ADDRESS "$dgf" "$ENV_L3_FILE"

upsert_env L3_L2OO_ADDRESS "$l2oo" "$L3_DIR/.env"
upsert_env L3_GAME_FACTORY_ADDRESS "$dgf" "$L3_DIR/.env"

upsert_env L3_L2OO_ADDRESS "$l2oo" "$ENV_FILE"
upsert_env L3_GAME_FACTORY_ADDRESS "$dgf" "$ENV_FILE"

deployer_addr=""
if command -v cast >/dev/null 2>&1; then
  deployer_addr="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
elif command -v node >/dev/null 2>&1; then
  deployer_addr="$(node -e "const { Wallet } = require('@ghostchain/sdk'); console.log(new Wallet(process.argv[1]).address)" "$DEPLOYER_PRIVATE_KEY")"
fi

jq -n \
  --arg portal "$portal" \
  --arg sys "$system_config" \
  --arg pv "$protocol_versions" \
  --arg dgf "$dgf" \
  --arg l2oo "$l2oo" \
  --arg std "$l1_std_bridge" \
  --arg cdm "$l1_cdm" \
  --arg rpc "$HOST_L2_RPC" \
  --arg chain "$L2_CHAIN_ID" \
  --arg deployer "$deployer_addr" \
  '{
    OptimismPortalProxy: $portal,
    SystemConfigProxy: $sys,
    ProtocolVersionsProxy: $pv,
    DisputeGameFactoryProxy: $dgf,
    L2OutputOracleProxy: $l2oo,
    L1StandardBridgeProxy: $std,
    L1CrossDomainMessengerProxy: $cdm,
    "__meta": {
      rpc: $rpc,
      chainId: ($chain | tonumber),
      deployer: $deployer
    }
  }' >"$OP_DIR/config/l2-deployments.json"

if [ -f "$DEPLOY_CFG" ]; then
  tmp_cfg="$(mktemp)"
  jq --arg portal "$portal" --arg sys "$system_config" --arg pv "$protocol_versions" \
    --arg l2oo "$l2oo" --arg dgf "$dgf" --arg std "$l1_std_bridge" --arg cdm "$l1_cdm" \
    '.optimismPortalProxy = $portal
     | .systemConfigProxy = $sys
     | .protocolVersionsProxy = $pv
     | .l2OutputOracleProxy = $l2oo
     | .disputeGameFactoryProxy = $dgf
     | .l1StandardBridgeProxy = $std
     | .l1CrossDomainMessengerProxy = $cdm' \
    "$DEPLOY_CFG" >"$tmp_cfg" && mv "$tmp_cfg" "$DEPLOY_CFG"
fi

echo "L3 parent contracts deployed on L2:"
echo "  SystemConfig: $system_config"
echo "  OptimismPortal: $portal"
echo "  ProtocolVersions: $protocol_versions"
echo "  L2OutputOracle: $l2oo"
echo "  DisputeGameFactory: $dgf"
echo "Updated: $ROLLUP_JSON $ENV_L3_FILE $L3_DIR/.env $ENV_FILE"
