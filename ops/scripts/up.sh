#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:up] %s\n' "$*"
}

if [ -x "$ROOT_DIR/infra/scripts/up.sh" ]; then
  log "Running infra/scripts/up.sh"
  bash "$ROOT_DIR/infra/scripts/up.sh"
else
  log "Missing infra/scripts/up.sh"
  exit 1
fi

log "Up complete"
