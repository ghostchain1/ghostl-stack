#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MAINNET_GATE_RPC:-}" ]]; then
  echo "MAINNET_GATE_RPC is required" >&2
  exit 2
fi

if [[ -z "${MAINNET_GATE_ADDRESS:-}" ]]; then
  echo "MAINNET_GATE_ADDRESS is required" >&2
  exit 2
fi

payload=$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"${MAINNET_GATE_ADDRESS}","data":"0x4668a8f3"},"latest"]}
JSON
)

result=$(curl -sS -H 'content-type: application/json' --data "$payload" "$MAINNET_GATE_RPC")

if echo "$result" | grep -qi '"result":"0x0000000000000000000000000000000000000000000000000000000000000001"\|"result":"0x1"'; then
  echo "mainnet_activation_gate=active"
  exit 0
fi

echo "mainnet_activation_gate=inactive"
exit 1
