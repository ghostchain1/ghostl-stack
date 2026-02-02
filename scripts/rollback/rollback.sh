#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="${1:-}"

if [[ -z "$SNAPSHOT_DIR" ]]; then
  if [[ -f "$ROOT_DIR/backups/LATEST" ]]; then
    SNAPSHOT_DIR="$(cat "$ROOT_DIR/backups/LATEST")"
  fi
fi

if [[ -z "$SNAPSHOT_DIR" || ! -d "$SNAPSHOT_DIR/files" ]]; then
  echo "Rollback failed: snapshot directory missing."
  echo "Usage: $0 /path/to/backup"
  exit 1
fi

echo "Restoring config files from $SNAPSHOT_DIR"

while IFS= read -r file; do
  src="$SNAPSHOT_DIR/files/$file"
  dest="$ROOT_DIR/$file"
  mkdir -p "$(dirname "$dest")"
  cp -a "$src" "$dest"
done < <(cd "$SNAPSHOT_DIR/files" && find . -type f | sed 's|^./||')

echo "Rollback restore complete."
echo "Note: container restarts are not automatic. Use scripts/run/restart-sequential.sh if needed."
