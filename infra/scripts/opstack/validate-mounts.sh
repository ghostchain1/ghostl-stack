#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

MODE="${1:-all}"
FAILED=0

note() {
  echo "$1" >&2
}

fail() {
  note "missing: $1"
  FAILED=1
}

require_dir() {
  local path="$1"
  if [ ! -d "$path" ]; then
    fail "directory $path"
  fi
}

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    fail "file $path"
  fi
}

check_l2() {
  require_dir "$OP_DIR/config"
  require_file "$OP_DIR/config/rollup.json"
  require_file "$OP_DIR/config/l1-chain.json"
  require_file "$OP_DIR/config/genesis-l2.json"
  require_file "$OP_DIR/config/jwt.txt"
}

check_l3() {
  local l3_name="${L3_NAME:-ghostl3}"
  local l3_dir="$OP_DIR/l3/$l3_name"
  local l3_config="$l3_dir/config"
  require_dir "$l3_dir"
  require_dir "$l3_config"
  require_file "$l3_config/rollup.json"
  require_file "$l3_config/l1-chain.json"
  require_file "$l3_config/jwt.txt"
  require_file "$l3_config/genesis.json"
}

case "$MODE" in
  l2|--l2)
    check_l2
    ;;
  l3|--l3)
    check_l3
    ;;
  all|--all)
    check_l2
    if [ "${ENABLE_L3:-1}" = "1" ]; then
      check_l3
    fi
    ;;
  *)
    note "usage: $(basename "$0") [l2|l3|all]"
    exit 2
    ;;
esac

if [ "$FAILED" -ne 0 ]; then
  note "Mount preflight failed. Fix missing paths and retry."
  exit 1
fi

note "Mount preflight ok."
