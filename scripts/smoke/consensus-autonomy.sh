#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

log "Smoke check: syntax"
node --check "$ROOT_DIR/services/network-manager-service/src/index.js"
node --check "$ROOT_DIR/services/consensus-telemetry-service/src/index.js"

log "Smoke check: consensus-telemetry-service unit tests"
(
  cd "$ROOT_DIR/services/consensus-telemetry-service"
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi
  npm test
)

log "Smoke check: OK"
