#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP_ROOT="${SNAP_ROOT:-$ROOT_DIR/ops/snapshots/consensus-autonomy}"
ACTION="${1:-backup}"
TARGET="${2:-}"

NETWORK_MANAGER_DATA="$ROOT_DIR/services/network-manager-service/data"
CONSENSUS_TELEMETRY_DATA="$ROOT_DIR/services/consensus-telemetry-service/data"

usage() {
  cat <<'USAGE'
Usage: rollback-consensus-autonomy.sh [backup|restore|list] [snapshot_dir]

backup  -> create snapshot under ops/snapshots/consensus-autonomy/<timestamp>
restore -> restore data directories from a snapshot
list    -> list available snapshots
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

sync_dir() {
  local src="$1"
  local dest="$2"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src/" "$dest/"
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -a "$src/." "$dest/"
  fi
}

case "$ACTION" in
  list)
    if [[ -d "$SNAP_ROOT" ]]; then
      ls -1 "$SNAP_ROOT"
    else
      echo "No snapshots found."
    fi
    ;;
  backup)
    TS="$(date -u +%Y%m%d-%H%M%S)"
    SNAP_DIR="$SNAP_ROOT/$TS"
    mkdir -p "$SNAP_DIR"
    log "Snapshot -> $SNAP_DIR"
    if [[ -d "$NETWORK_MANAGER_DATA" ]]; then
      mkdir -p "$SNAP_DIR/network-manager-data"
      sync_dir "$NETWORK_MANAGER_DATA" "$SNAP_DIR/network-manager-data"
    fi
    if [[ -d "$CONSENSUS_TELEMETRY_DATA" ]]; then
      mkdir -p "$SNAP_DIR/consensus-telemetry-data"
      sync_dir "$CONSENSUS_TELEMETRY_DATA" "$SNAP_DIR/consensus-telemetry-data"
    fi
    cat > "$SNAP_DIR/metadata.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitCommit": "$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
}
EOF
    log "Snapshot complete."
    ;;
  restore)
    if [[ -z "$TARGET" ]]; then
      echo "Missing snapshot dir." >&2
      usage
      exit 1
    fi
    SNAP_DIR="$TARGET"
    if [[ ! -d "$SNAP_DIR" ]]; then
      SNAP_DIR="$SNAP_ROOT/$TARGET"
    fi
    if [[ ! -d "$SNAP_DIR" ]]; then
      echo "Snapshot not found: $TARGET" >&2
      exit 1
    fi
    log "Restoring from $SNAP_DIR"
    if [[ -d "$SNAP_DIR/network-manager-data" ]]; then
      mkdir -p "$NETWORK_MANAGER_DATA"
      sync_dir "$SNAP_DIR/network-manager-data" "$NETWORK_MANAGER_DATA"
    fi
    if [[ -d "$SNAP_DIR/consensus-telemetry-data" ]]; then
      mkdir -p "$CONSENSUS_TELEMETRY_DATA"
      sync_dir "$SNAP_DIR/consensus-telemetry-data" "$CONSENSUS_TELEMETRY_DATA"
    fi
    log "Restore complete."
    ;;
  *)
    usage
    exit 1
    ;;
esac
