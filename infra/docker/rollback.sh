#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="$ROOT_DIR/infra/docker/_backup"

latest_backup() {
  local latest
  latest=$(ls -1 "$BACKUP_ROOT" 2>/dev/null | sort | tail -n 1 || true)
  if [[ -z "$latest" ]]; then
    echo "No backup snapshots found under $BACKUP_ROOT" >&2
    exit 1
  fi
  echo "$BACKUP_ROOT/$latest"
}

BACKUP_DIR="$(latest_backup)"
MANIFEST="$BACKUP_DIR/MANIFEST.txt"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing MANIFEST.txt in $BACKUP_DIR" >&2
  exit 1
fi

echo "Restoring files from: $BACKUP_DIR"

while IFS= read -r relpath; do
  [[ -z "$relpath" ]] && continue
  src="$BACKUP_DIR/$relpath"
  dst="$ROOT_DIR/$relpath"
  if [[ ! -f "$src" ]]; then
    echo "WARN: missing in backup: $relpath" >&2
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  cp -a "$src" "$dst"
  echo "Restored: $relpath"
done < "$MANIFEST"

echo "Rollback restore completed."

read -r -p "Run 'docker compose down' now? [y/N] " yn
case "$yn" in
  [yY][eE][sS]|[yY])
    echo "Running docker compose down from $ROOT_DIR..."
    (cd "$ROOT_DIR" && docker compose down)
    ;;
  *)
    echo "Skipping docker compose down."
    ;;
esac
