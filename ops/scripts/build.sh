#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:build] %s\n' "$*"
}

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required"
  exit 1
fi

if [ -x "$ROOT_DIR/infra/scripts/opstack/build.sh" ]; then
  log "Building OP Stack images"
  bash "$ROOT_DIR/infra/scripts/opstack/build.sh"
else
  log "Missing infra/scripts/opstack/build.sh"
  exit 1
fi

if [ -f "$ROOT_DIR/package.json" ]; then
  log "Building apps (root npm run build)"
  (cd "$ROOT_DIR" && npm run build)
else
  log "Missing package.json at repo root"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/build-services-sequential.sh" ]; then
  log "Building services (docker compose)"
  bash "$ROOT_DIR/scripts/build-services-sequential.sh"
else
  log "Missing scripts/build-services-sequential.sh"
  exit 1
fi

log "Build complete"
