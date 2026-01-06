#!/usr/bin/env bash
set -euo pipefail

# OP Stack chain bootstrap helper.
# Starts GhostL2 (L1 anvil + OP Stack L2) and optionally a GhostL3 overlay.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OP_DIR="$ROOT_DIR/infra/opstack"
DEFAULT_L3_NAME="${DEFAULT_L3_NAME:-ghostl3}"

usage() {
  cat <<EOF >&2
Usage: bash infra/scripts/chains/init.sh [all|l2|l3] [l3-name]
  all (default): start OP Stack L2 and the specified L3 overlay (requires infra/opstack/l3/<name>/.env)
  l2:            start OP Stack L2 only (infra/scripts/opstack/up.sh)
  l3:            start the L3 overlay on top of L2 (defaults to name '${DEFAULT_L3_NAME}')
EOF
}

target="${1:-all}"
l3_name="${2:-$DEFAULT_L3_NAME}"

if [ ! -f "$OP_DIR/.env" ]; then
  echo "Missing $OP_DIR/.env (copy .env.sample and run infra/scripts/opstack/keys/init.sh)" >&2
  exit 1
fi

start_l2() {
  echo "Starting OP Stack L2..."
  bash "$ROOT_DIR/infra/scripts/opstack/up.sh"
}

start_l3() {
  local name="$1"
  local env_file="$OP_DIR/l3/$name/.env"
  if [ ! -f "$env_file" ]; then
    echo "Missing $env_file. Create it via: bash infra/scripts/opstack/l3/new.sh $name" >&2
    exit 1
  fi
  echo "Starting OP Stack L3 overlay ($name)..."
  bash "$ROOT_DIR/infra/scripts/opstack/l3/up.sh" "$name"
}

case "$target" in
  all)
    start_l2
    start_l3 "$l3_name"
    ;;
  l2)
    start_l2
    ;;
  l3)
    start_l2
    start_l3 "$l3_name"
    ;;
  *)
    usage
    exit 1
    ;;
esac
