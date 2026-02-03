#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    log "Missing file: $file"
    return 1
  fi
}

log "Failure-mode drill docs"
require_file "$ROOT_DIR/docs/ai-core/failure-mode-drills.md"

log "Federation invariants"
require_file "$ROOT_DIR/scripts/smoke/federation-invariants.sh"

log "Run invariant tests"
( cd "$ROOT_DIR/contracts" && npm run test:invariant )

if command -v forge >/dev/null 2>&1; then
  log "Run governance bypass test"
  ( cd "$ROOT_DIR/contracts" && forge test --match-path test/foundry/AIAttestationHubPolicyGuard.t.sol --match-test testGovernanceBypassRestricted )

  log "Run emergency scope test"
  ( cd "$ROOT_DIR/contracts" && forge test --match-path test/invariants/AIConstitution.invariant.t.sol --match-test test_emergency_scope_rejected )
else
  log "Forge not available; skipping targeted failure-mode tests"
fi

log "Failure-mode checks complete"
