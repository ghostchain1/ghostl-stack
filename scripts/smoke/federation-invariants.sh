#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

has_line() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$file"
  else
    grep -Eq "$pattern" "$file"
  fi
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    log "Missing file: $file"
    return 1
  fi
}

require_executable() {
  local file="$1"
  if [ ! -x "$file" ]; then
    log "Not executable: $file"
    return 1
  fi
}

require_line() {
  local pattern="$1"
  local file="$2"
  if ! has_line "$pattern" "$file"; then
    log "Missing pattern '$pattern' in $file"
    return 1
  fi
}

missing=0

log "Federation invariants: required docs and scripts"
require_file "$ROOT_DIR/docs/ai-core/federation.md" || missing=1
require_file "$ROOT_DIR/infra/scripts/federation/export-policy-checkpoint.sh" || missing=1
require_executable "$ROOT_DIR/infra/scripts/federation/export-policy-checkpoint.sh" || missing=1

log "Federation invariants: env wiring for L2"
ENV_L2="$ROOT_DIR/environments/devnet/ghostl2.env.example"
require_file "$ENV_L2" || missing=1
require_line "^CHAIN_POLICY_REGISTRY_ADDRESS=" "$ENV_L2" || missing=1
require_line "^CHAIN_POLICY_REGISTRY_RPC=" "$ENV_L2" || missing=1
require_line "^CHAIN_POLICY_REQUIRED=" "$ENV_L2" || missing=1

log "Federation invariants: env wiring for L3"
ENV_L3="$ROOT_DIR/environments/devnet/ghostl3.env.example"
require_file "$ENV_L3" || missing=1
require_line "^CHAIN_POLICY_REGISTRY_ADDRESS=" "$ENV_L3" || missing=1
require_line "^CHAIN_POLICY_REGISTRY_RPC=" "$ENV_L3" || missing=1
require_line "^CHAIN_POLICY_REQUIRED=" "$ENV_L3" || missing=1

if [ "$missing" -ne 0 ]; then
  log "Federation invariants: FAILED"
  exit 1
fi

log "Federation invariants: OK"
