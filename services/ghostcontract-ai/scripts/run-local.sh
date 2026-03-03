#!/usr/bin/env bash
# GhostContractAI — local development runner
# Usage: ./scripts/run-local.sh [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SERVICE_DIR/../.." && pwd)"

# Defaults
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-7610}"
export GHOSTAI_DRY_RUN="${GHOSTAI_DRY_RUN:-true}"
export GHOSTAI_DB_PATH="${GHOSTAI_DB_PATH:-/tmp/ghost-contract-ai-dev.db}"
export GHOSTAI_ALLOWED_ROOTS="${GHOSTAI_ALLOWED_ROOTS:-$REPO_ROOT/contracts}"
export CONTRACTS_DIR="${CONTRACTS_DIR:-$REPO_ROOT/contracts}"
export FOUNDRY_PROFILE="${FOUNDRY_PROFILE:-default}"
export GHOSTAI_MEMORY_SOFT_MB="${GHOSTAI_MEMORY_SOFT_MB:-256}"
export GHOSTAI_MEMORY_HARD_MB="${GHOSTAI_MEMORY_HARD_MB:-512}"
export GHOSTAI_MAX_JOBS="${GHOSTAI_MAX_JOBS:-1}"
export GHOSTAI_FORGE_CONCURRENCY="${GHOSTAI_FORGE_CONCURRENCY:-1}"

# Warn if no shared secret set (dev passthrough enabled)
if [[ -z "${GHOSTBRAIN_SHARED_SECRET:-}" ]]; then
  echo "⚠  GHOSTBRAIN_SHARED_SECRET not set — /v1/jobs auth is OPEN (dev mode)" >&2
fi

echo "🚀 Starting GhostContractAI (local)"
echo "   DB:      $GHOSTAI_DB_PATH"
echo "   Roots:   $GHOSTAI_ALLOWED_ROOTS"
echo "   DryRun:  $GHOSTAI_DRY_RUN"
echo "   Port:    $PORT"

cd "$SERVICE_DIR"
exec pnpm dev
