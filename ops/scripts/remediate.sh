#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[ghostctl:remediate] %s\n' "$*"
}

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required"
  exit 1
fi

if [ -f "$ROOT_DIR/package-lock.json" ]; then
  log "Running npm audit fix at repo root"
  (cd "$ROOT_DIR" && npm audit fix --audit-level=high)
else
  log "Missing package-lock.json at repo root"
  exit 1
fi

if [ -f "$ROOT_DIR/contracts/package-lock.json" ]; then
  log "Running npm audit fix in contracts"
  (cd "$ROOT_DIR/contracts" && npm audit fix --audit-level=high)
fi

if [ -f "$ROOT_DIR/ghost-helper-bots/package-lock.json" ]; then
  log "Running npm audit fix in ghost-helper-bots"
  (cd "$ROOT_DIR/ghost-helper-bots" && npm audit fix --audit-level=high)
fi

log "Remediation complete"
