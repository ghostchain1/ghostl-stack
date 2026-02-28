#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

compose_cmd down --remove-orphans

if [[ -n "${RESTORE_ARCHIVE:-}" ]]; then
  restore_dir="$ARTIFACT_DIR/rollback-restore-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$restore_dir"
  tar -xzf "$RESTORE_ARCHIVE" -C "$restore_dir"
  echo "[rollback] extracted backup archive into $restore_dir"
fi

echo "[rollback] stack stopped"
