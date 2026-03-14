#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:fix] %s\n' "$*"
}

log "Fix placeholder: running doctor for diagnostics"
if [ -x "$ROOT_DIR/infra/scripts/doctor.sh" ]; then
  bash "$ROOT_DIR/infra/scripts/doctor.sh"
else
  log "Missing infra/scripts/doctor.sh"
  exit 1
fi

log "Fix placeholder: git status"
(cd "$ROOT_DIR" && git status --porcelain)
