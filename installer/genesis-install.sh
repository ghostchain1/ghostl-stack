#!/usr/bin/env bash
# genesis-install.sh — GhostStack Genesis Installer
#
# Deploys the complete GhostStack ecosystem in the correct boot order:
#
#   Hypervisor → Docker → GhostChain L1 → GhostL2 → GhostL3
#   → Sovereign services → GhostBrain → Apps
#
# Usage:
#   bash installer/genesis-install.sh [--dry-run] [--skip-docker]
#
# Chain IDs:  L1=14000101  L2=901  L3=903
# RPC ports:  L1=18545     L2=29547   L3=39545
#
# SECURITY: This script does NOT use eval, exec with user input, or shell=True.
#           All docker compose arguments are shell-quoted literals.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${STACK_DIR}/installer/genesis-install.log"
DRY_RUN=0
SKIP_DOCKER=0

# ── Argument parsing ──────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    --help|-h)
      echo "Usage: bash genesis-install.sh [--dry-run] [--skip-docker]"
      echo "  --dry-run      Print each step without executing"
      echo "  --skip-docker  Skip Docker/system dependency install"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

# ── Logging ───────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

run_step() {
  local script="$1"
  local label="${2:-$1}"
  log "==> $label"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "    [DRY RUN] would run: bash ${SCRIPT_DIR}/${script}"
    return 0
  fi
  # Run each sub-script with the same flags forwarded
  bash "${SCRIPT_DIR}/${script}" 2>&1 | tee -a "$LOG_FILE"
  log "    $label — OK"
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────

log "╔══════════════════════════════════════════════════════════╗"
log "║       GhostStack Genesis Installer — $(date '+%Y-%m-%d')        ║"
log "╚══════════════════════════════════════════════════════════╝"
log "Stack directory : $STACK_DIR"
log "Log file        : $LOG_FILE"
[[ "$DRY_RUN"     -eq 1 ]] && log "Mode: DRY RUN (no changes will be made)"
[[ "$SKIP_DOCKER" -eq 1 ]] && log "Skipping Docker install phase"

if [[ ! -f "${STACK_DIR}/docker-compose.yml" ]]; then
  log "ERROR: docker-compose.yml not found in $STACK_DIR" >&2
  exit 1
fi

if [[ ! -f "${STACK_DIR}/.env" ]]; then
  if [[ -f "${STACK_DIR}/stack.env.example" ]]; then
    log "WARNING: .env not found — copying stack.env.example to .env"
    [[ "$DRY_RUN" -eq 0 ]] && cp "${STACK_DIR}/stack.env.example" "${STACK_DIR}/.env"
  else
    log "ERROR: .env not found and no stack.env.example to copy from" >&2
    exit 1
  fi
fi

# ── Phase 1: System dependencies ─────────────────────────────────────────────

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  run_step "install-docker.sh" "Phase 1: Install Docker + system dependencies"
else
  log "==> Phase 1: Skipped (--skip-docker)"
fi

# ── Phase 2: Blockchain layers (strict order — L1 must be healthy before L2) ──

run_step "deploy-ghostchain.sh" "Phase 2a: Deploy GhostChain L1 (chain_id=14000101)"
run_step "deploy-ghostl2.sh"    "Phase 2b: Deploy GhostL2     (chain_id=901)"
run_step "deploy-ghostl3.sh"    "Phase 2c: Deploy GhostL3     (chain_id=903)"

# ── Phase 3: Sovereign services ───────────────────────────────────────────────

run_step "deploy-services.sh"   "Phase 3: Deploy sovereign & economic services"

# ── Phase 4: Applications & AI ────────────────────────────────────────────────

run_step "deploy-apps.sh"       "Phase 4: Deploy applications, gateway, GhostBrain"

# ── Phase 5: Verification ─────────────────────────────────────────────────────

run_step "verify-system.sh"     "Phase 5: System verification"

log ""
log "╔══════════════════════════════════════════════════════════╗"
log "║         GhostStack deployment COMPLETE                   ║"
log "╟──────────────────────────────────────────────────────────╢"
log "║  L1 RPC     : http://localhost:18545                     ║"
log "║  L2 RPC     : http://localhost:29547                     ║"
log "║  L3 RPC     : http://localhost:39545                     ║"
log "║  API        : http://localhost:4000                      ║"
log "║  Web UI     : http://localhost:3000                      ║"
log "║  GhostBrain : http://localhost:7900                      ║"
log "║  Orchestrator: http://localhost:7895                     ║"
log "╟──────────────────────────────────────────────────────────╢"
log "║  Log        : $LOG_FILE"
log "╚══════════════════════════════════════════════════════════╝"
