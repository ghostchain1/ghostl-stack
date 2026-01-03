#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

addr="${1:-}"
if [ -z "$addr" ]; then
  echo "Usage: bash infra/scripts/chains/premine.sh 0xYourAddress [--l3]" >&2
  exit 1
fi

if ! echo "$addr" | rg -q '^0x[0-9a-fA-F]{40}$'; then
  echo "Invalid address: $addr" >&2
  exit 1
fi

apply_to_l3=0
if [ "${2:-}" = "--l3" ]; then
  apply_to_l3=1
fi

update_cfg() {
  local cfg="$1"
  local tmp="${cfg}.tmp"
  jq --arg addr "$addr" '.premine.address = $addr' "$cfg" >"$tmp"
  mv "$tmp" "$cfg"
}

update_cfg "$ROOT_DIR/chains/l2/chain.json"
echo "Updated L2 premine address in chains/l2/chain.json"

if [ "$apply_to_l3" -eq 1 ]; then
  update_cfg "$ROOT_DIR/chains/l3/chain.json"
  echo "Updated L3 premine address in chains/l3/chain.json"
fi

echo "Next: bash infra/scripts/reset.sh && bash infra/scripts/up.sh"
