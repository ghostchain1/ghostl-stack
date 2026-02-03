#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [ -d "/home/ghost/.foundry/bin" ]; then
  export PATH="/home/ghost/.foundry/bin:$PATH"
fi

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

require_exec() {
  local file="$1"
  if [ ! -x "$file" ]; then
    log "Not executable: $file"
    return 1
  fi
}

missing=0

log "AI governance docs and artifacts"
require_file "$ROOT_DIR/docs/architecture/ghostchain-ai-governance-whitepaper.md" || missing=1
require_file "$ROOT_DIR/docs/ai-core/invariants.md" || missing=1
require_file "$ROOT_DIR/docs/ai-core/invariant-registry.json" || missing=1
require_file "$ROOT_DIR/docs/security/ai-governance-invariants.yaml" || missing=1
require_file "$ROOT_DIR/docs/ai-core/ratification.md" || missing=1
require_file "$ROOT_DIR/docs/ai-core/federation.md" || missing=1
require_file "$ROOT_DIR/docs/ai-core/failure-mode-drills.md" || missing=1
require_file "$ROOT_DIR/docs/ghostchain/ratification-package.md" || missing=1

log "AI governance scripts"
require_exec "$ROOT_DIR/infra/scripts/evidence-pack-ai-governance.sh" || missing=1
require_exec "$ROOT_DIR/scripts/smoke/federation-invariants.sh" || missing=1
require_exec "$ROOT_DIR/scripts/smoke/ai-governance-failure-modes.sh" || missing=1

log "Governance reports"
require_file "$ROOT_DIR/contracts/reports/ai_constitutional_proposal.json" || missing=1
require_file "$ROOT_DIR/contracts/reports/policy_primitives_status.json" || missing=1

if [ "$missing" -ne 0 ]; then
  log "AI governance go/no-go: FAILED (missing files)"
  exit 1
fi

log "Federation invariants"
"$ROOT_DIR/scripts/smoke/federation-invariants.sh"

log "Failure-mode drill validation"
"$ROOT_DIR/scripts/smoke/ai-governance-failure-modes.sh"

log "Evidence pack reproducibility"
EVIDENCE_TIMESTAMP=20260203T180000Z \
EVIDENCE_EPOCH=1760100000 \
"$ROOT_DIR/infra/scripts/evidence-pack-ai-governance.sh" --verify

if [ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]; then
  log "AI governance go/no-go: FAILED (dirty working tree)"
  git -C "$ROOT_DIR" status -sb
  exit 1
fi

log "AI governance go/no-go: OK"
