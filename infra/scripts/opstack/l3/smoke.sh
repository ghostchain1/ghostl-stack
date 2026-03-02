#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-}"
if [ -z "$ENV_FILE" ] || [ ! -f "$ENV_FILE" ]; then
  echo "usage: smoke.sh <path-to-l3-env>" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

RPC_HOST_PORT="${L3_HOST_RPC:-39545}"
ROLLUP_RPC_HOST_PORT="${L3_ROLLUP_RPC_HOST_PORT:-39546}"
RPC_URL="http://localhost:${RPC_HOST_PORT}"
ROLLUP_RPC_URL="http://localhost:${ROLLUP_RPC_HOST_PORT}"

echo "Checking L3 RPC @ $RPC_URL ..."
chain_id=$(curl -fsS -X POST "$RPC_URL" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | jq -r '.result')
echo "chainId: $chain_id"

block0=$(curl -fsS -X POST "$RPC_URL" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}' | jq -r '.result.number')
echo "latest block: $block0"

echo "Checking rollup RPC @ $ROLLUP_RPC_URL ..."
syncing=$(curl -fsS -X POST "$ROLLUP_RPC_URL" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_syncing","params":[]}' | jq -r '.result')
echo "rollup syncing: $syncing"

echo "Smoke check OK"
