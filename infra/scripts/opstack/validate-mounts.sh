#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"
RUNTIME_CHOWN_IMAGE="${OPSTACK_RUNTIME_CHOWN_IMAGE:-public.ecr.aws/docker/library/alpine:3.20}"

if [ -f "$OP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_DIR/.env"
  set +a
fi

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_docker_init

OPSTACK_UID_VALUE="${OPSTACK_UID:-1000}"
OPSTACK_GID_VALUE="${OPSTACK_GID:-1000}"

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

ensure_runtime_tree() {
  local path="$1"
  mkdir -p "$path"
  if ! chown -R "$OPSTACK_UID_VALUE:$OPSTACK_GID_VALUE" "$path" 2>/dev/null; then
    hg_docker run --rm --entrypoint /bin/sh -u 0:0 \
      -v "$path":/target \
      "$RUNTIME_CHOWN_IMAGE" \
      -c "chown -R $OPSTACK_UID_VALUE:$OPSTACK_GID_VALUE /target && chmod 775 /target"
  else
    chmod 775 "$path" 2>/dev/null || true
  fi
}

check_l2() {
  require_dir "$OP_DIR/config"
  require_file "$OP_DIR/config/rollup.json"
  require_file "$OP_DIR/config/l1-chain.json"
  require_file "$OP_DIR/config/genesis-l2.json"
  require_file "$OP_DIR/config/jwt.txt"
  ensure_runtime_tree "$OP_DIR/data"
  ensure_runtime_tree "$OP_DIR/data/op-gate-state"
  ensure_runtime_tree "$OP_DIR/data/op-gate-l1-state"
  ensure_runtime_tree "$OP_DIR/data/l2-geth-${L2_CHAIN_ID:-901}"
  ensure_runtime_tree "$OP_DIR/data/op-node"
  ensure_runtime_tree "$OP_DIR/data/op-sequencer"
}

check_l3() {
  local l3_name="${L3_NAME:-ghostl3}"
  local l3_dir="$OP_DIR/l3/$l3_name"
  local l3_config="$l3_dir/config"
  local l3_env="$l3_dir/.env"

  if [ -f "$l3_env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$l3_env"
    set +a
  fi

  require_dir "$l3_dir"
  require_dir "$l3_config"
  require_file "$l3_config/rollup.json"
  require_file "$l3_config/l1-chain.json"
  require_file "$l3_config/jwt.txt"
  require_file "$l3_config/genesis.json"
  ensure_runtime_tree "$l3_dir"
  ensure_runtime_tree "$l3_dir/data-${L3_CHAIN_ID:-903}"
  ensure_runtime_tree "$l3_dir/data-${L3_CHAIN_ID:-903}/op-node"
  ensure_runtime_tree "$l3_dir/backups"
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
