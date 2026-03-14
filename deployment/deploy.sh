#!/usr/bin/env bash
# ============================================================
# GhostStack Master Deployment Blueprint (MDB) — v1.0
# Single-command full-ecosystem deployment
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --skip-preflight   Skip system requirement checks
#   --skip-build       Skip Docker image builds
#   --only <layer>     Deploy only one layer:
#                        data-mesh | ghostbrain | validators |
#                        monitoring | ai-engines | web
#   --down             Stop all stacks (alias for stop-all.sh)
#   --status           Print health status (alias for status.sh)
#   --help             Show this message
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Load master environment ───────────────────────────────────
if [[ -f "${SCRIPT_DIR}/configs/ghoststack.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${SCRIPT_DIR}/configs/ghoststack.env"; set +a
fi
# Allow an override file to be layered on top
if [[ -f "${SCRIPT_DIR}/configs/ghoststack.local.env" ]]; then
  set -a; source "${SCRIPT_DIR}/configs/ghoststack.local.env"; set +a
fi

export STACK_ROOT SCRIPT_DIR

# ── Colour helpers ────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
info() { echo -e "${CYAN}[→]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "${RED}[✗]${RESET} $*"; exit 1; }
banner() {
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════╗"
  printf "║  %-52s  ║\n" "$*"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

# ── Parse arguments ───────────────────────────────────────────
SKIP_PREFLIGHT=false
SKIP_BUILD=false
ONLY_LAYER=""
ACTION="deploy"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-preflight) SKIP_PREFLIGHT=true ;;
    --skip-build)     SKIP_BUILD=true ;;
    --only)           shift; ONLY_LAYER="$1" ;;
    --down)           ACTION="down" ;;
    --status)         ACTION="status" ;;
    --help|-h)        ACTION="help" ;;
    *) warn "Unknown option: $1" ;;
  esac
  shift
done

# ── Actions ───────────────────────────────────────────────────
case "$ACTION" in
  down)
    banner "GhostStack — Stopping All Stacks"
    exec bash "${SCRIPT_DIR}/scripts/stop-all.sh"
    ;;
  status)
    exec bash "${SCRIPT_DIR}/scripts/status.sh"
    ;;
  help)
    sed -n '3,20p' "$0"
    exit 0
    ;;
esac

# ── Deploy ────────────────────────────────────────────────────
banner "GhostStack Master Deployment Blueprint v1.0"
info "Stack root: ${STACK_ROOT}"
info "Config:     ${SCRIPT_DIR}/configs/ghoststack.env"
echo

# Step 1 – Preflight
if [[ "${SKIP_PREFLIGHT}" == false ]]; then
  info "Running preflight checks…"
  bash "${SCRIPT_DIR}/scripts/00-preflight.sh" || fail "Preflight failed. Aborting."
  ok "Preflight passed"
else
  warn "Skipping preflight checks"
fi

# Step 2 – Start stacks
bash "${SCRIPT_DIR}/scripts/start-all.sh" \
  --skip-build   "${SKIP_BUILD}" \
  --only-layer   "${ONLY_LAYER}"

banner "GhostStack Deployment Complete"
echo
bash "${SCRIPT_DIR}/scripts/status.sh" || true
