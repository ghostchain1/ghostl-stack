#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:doctor] %s\n' "$*"
}

if [ -x "$ROOT_DIR/infra/scripts/doctor.sh" ]; then
  log "Running infra/scripts/doctor.sh"
  bash "$ROOT_DIR/infra/scripts/doctor.sh"
else
  log "Missing infra/scripts/doctor.sh"
  exit 1
fi

if [ -x "$ROOT_DIR/ops/scripts/verify.sh" ]; then
  log "Running ops/scripts/verify.sh"
  bash "$ROOT_DIR/ops/scripts/verify.sh" || true
fi

log "Doctor complete"
