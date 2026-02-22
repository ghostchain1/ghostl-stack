#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OPSTACK_DIR="$ROOT_DIR/infra/opstack"
ENV_L2="${PHASE7_ENV_L2:-$OPSTACK_DIR/.env}"
ENV_L3="${PHASE7_ENV_L3:-$OPSTACK_DIR/.env.l3}"
ACTION="${1:-check}"

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

L2_CHAIN_ID="${L2_CHAIN_ID:-901}"
L3_CHAIN_ID="${L3_CHAIN_ID:-903}"
L3_NAME="${L3_NAME:-ghostl3}"

L2_DATA_DIR="$OPSTACK_DIR/data/l2-geth-${L2_CHAIN_ID}"
OP_NODE_DATA_DIR="$OPSTACK_DIR/data/op-node"
OP_SEQUENCER_DATA_DIR="$OPSTACK_DIR/data/op-sequencer"
L3_DATA_DIR="$OPSTACK_DIR/l3/${L3_NAME}/data-${L3_CHAIN_ID}"

L2_GENESIS="$OPSTACK_DIR/config/genesis-l2.json"
L3_GENESIS="$OPSTACK_DIR/l3/${L3_NAME}/config/genesis.json"

TARGET_DIRS=(
  "$L2_DATA_DIR"
  "$OP_NODE_DATA_DIR"
  "$OP_SEQUENCER_DATA_DIR"
  "$L3_DATA_DIR"
)

usage() {
  cat <<'USAGE'
Usage: validate-node-hygiene.sh [check|prepare]

check   -> verify data dirs exist, are writable, and genesis fingerprints are not stale
prepare -> destructive reset of target data dirs, then re-create with writable permissions and stamp fingerprints
USAGE
}

log() {
  printf '[phase7] %s\n' "$*"
}

sha256_file() {
  local file="$1"
  sha256sum "$file" | awk '{print $1}'
}

ensure_writable_dir() {
  local dir="$1"
  mkdir -p "$dir"
  chmod 0777 "$dir"
  local probe="$dir/.phase7_write_test"
  : > "$probe"
  rm -f "$probe"
}

stamp_genesis() {
  local data_dir="$1"
  local genesis_file="$2"
  local marker="$data_dir/.genesis.sha256"
  local hash
  hash="$(sha256_file "$genesis_file")"
  printf '%s\n' "$hash" > "$marker"
}

validate_genesis_stamp() {
  local data_dir="$1"
  local genesis_file="$2"
  local label="$3"
  local marker="$data_dir/.genesis.sha256"
  local current
  current="$(sha256_file "$genesis_file")"

  if [[ ! -f "$marker" ]]; then
    printf '%s\n' "$current" > "$marker"
    log "INFO: initialized genesis stamp for $label"
    return 0
  fi

  local stamped
  stamped="$(tr -d '\n\r' < "$marker")"
  if [[ "$stamped" != "$current" ]]; then
    log "FAIL: stale genesis detected for $label (stamp mismatch)"
    return 1
  fi
  return 0
}

failures=0

case "$ACTION" in
  prepare)
    log "Resetting target data directories"
    for dir in "${TARGET_DIRS[@]}"; do
      rm -rf "$dir"
      ensure_writable_dir "$dir"
      log "prepared $dir"
    done
    if [[ -f "$L2_GENESIS" ]]; then
      stamp_genesis "$L2_DATA_DIR" "$L2_GENESIS"
    fi
    if [[ -f "$L3_GENESIS" ]]; then
      stamp_genesis "$L3_DATA_DIR" "$L3_GENESIS"
    fi
    ;;
  check)
    for dir in "${TARGET_DIRS[@]}"; do
      if ensure_writable_dir "$dir"; then
        log "PASS: writable $dir"
      else
        log "FAIL: not writable $dir"
        failures=$((failures + 1))
      fi
    done

    if [[ -f "$L2_GENESIS" ]]; then
      if ! validate_genesis_stamp "$L2_DATA_DIR" "$L2_GENESIS" "L2"; then
        failures=$((failures + 1))
      else
        log "PASS: L2 genesis stamp valid"
      fi
    else
      log "FAIL: missing L2 genesis file $L2_GENESIS"
      failures=$((failures + 1))
    fi

    if [[ -f "$L3_GENESIS" ]]; then
      if ! validate_genesis_stamp "$L3_DATA_DIR" "$L3_GENESIS" "L3"; then
        failures=$((failures + 1))
      else
        log "PASS: L3 genesis stamp valid"
      fi
    else
      log "FAIL: missing L3 genesis file $L3_GENESIS"
      failures=$((failures + 1))
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac

cat <<EOF
{
  "ok": $([[ "$failures" -eq 0 ]] && echo true || echo false),
  "action": "$ACTION",
  "l2ChainId": "$L2_CHAIN_ID",
  "l3ChainId": "$L3_CHAIN_ID",
  "l3Name": "$L3_NAME",
  "directories": [
    "$L2_DATA_DIR",
    "$OP_NODE_DATA_DIR",
    "$OP_SEQUENCER_DATA_DIR",
    "$L3_DATA_DIR"
  ],
  "failures": $failures
}
EOF

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

log "PASS: node hygiene gate satisfied"
