#!/usr/bin/env bash
# GhostStack Production Build & Start Script
# Builds all packages and starts the full stack

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

cd "$REPO_ROOT"

log "=== GhostStack Production Build & Start ==="
log "Repo root: $REPO_ROOT"
log "Node: $(node --version)"
log "npm: $(npm --version)"

# ─── Step 1: Install dependencies ────────────────────────────────────────────
log "Step 1: Installing dependencies..."
npm install --prefer-offline 2>&1 | tail -5
log "Dependencies installed."

# ─── Step 2: Build ghostwallet package ───────────────────────────────────────
log "Step 2: Building @ghostl/ghostwallet..."
cd "$REPO_ROOT/packages/ghostwallet"
npx tsc -p tsconfig.json 2>&1 && log "ghostwallet built OK" || fail "ghostwallet build failed"
cd "$REPO_ROOT"

# ─── Step 3: Build API ────────────────────────────────────────────────────────
log "Step 3: Building API (TypeScript)..."
cd "$REPO_ROOT/apps/api"
npx tsc -p tsconfig.json 2>&1 | tee "$LOG_DIR/api-build.log" | tail -20
if [ -f "$REPO_ROOT/dist/apps/api/apps/api/src/server.js" ]; then
  log "API built OK → dist/apps/api/apps/api/src/server.js"
else
  log "WARNING: Expected entry not found, checking dist..."
  find "$REPO_ROOT/dist" -name "server.js" 2>/dev/null | head -5
fi
cd "$REPO_ROOT"

# ─── Step 4: Build Worker ─────────────────────────────────────────────────────
log "Step 4: Building Worker (TypeScript)..."
cd "$REPO_ROOT/apps/worker"
npx tsc -p tsconfig.json 2>&1 | tee "$LOG_DIR/worker-build.log" | tail -10
log "Worker built."
cd "$REPO_ROOT"

# ─── Step 5: Build Web ────────────────────────────────────────────────────────
log "Step 5: Building Web (Next.js)..."
cd "$REPO_ROOT/apps/web"
NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_DISABLE_ESLINT=1 npx next build 2>&1 | tee "$LOG_DIR/web-build.log" | tail -20
log "Web built."
cd "$REPO_ROOT"

log "=== All builds complete ==="
log "Build artifacts:"
log "  API:    dist/apps/api/apps/api/src/server.js"
log "  Worker: apps/worker/dist/index.js"
log "  Web:    apps/web/.next-ghost/"
