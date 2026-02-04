#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:ci] %s\n' "$*"
}

log "Preflight"
bash "$ROOT_DIR/ops/scripts/preflight.sh"

log "Build"
bash "$ROOT_DIR/ops/scripts/build.sh"

log "Doctor"
bash "$ROOT_DIR/ops/scripts/doctor.sh"

log "Scan"
bash "$ROOT_DIR/ops/scripts/scan.sh"

log "Attest"
bash "$ROOT_DIR/ops/scripts/attest.sh"

log "CI local complete"
