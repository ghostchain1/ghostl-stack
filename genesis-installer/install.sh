#!/usr/bin/env bash
# GhostStack Genesis Installer — Main Entry Point
#
# Runs all phases in sequence:
#   configure  → system prereqs + env file
#   deploy_l1  → GhostChain L1 (ghostchaind, CometBFT)
#   deploy_l2  → GhostL2 OP Stack (l2-geth, op-node)
#   deploy_l3  → GhostL3 OP Stack (l3-geth, l3-op-node)
#   deploy_ghostbrain → AI layer (ghostbrain-core + agents)
#   monitoring → Prometheus, Grafana, Loki
#   start_stack → remaining services (compliance, API, web)
#
# Usage:
#   cd /home/ghost/ghostl-stack
#   bash genesis-installer/install.sh [--skip-prereqs]
#
# Required env (fail-closed if unset):
#   POSTGRES_PASSWORD
#   COMPLIANCE_JWT_SECRET

set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$(cd "${INSTALLER_DIR}/.." && pwd)"
LOG_FILE="${BASE}/logs/genesis-install-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "${BASE}/logs"

# Tee all output to a timestamped log.
exec > >(tee -a "${LOG_FILE}") 2>&1

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { echo "[$(date +%H:%M:%S)] [INFO]  $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [WARN]  $*" >&2; }
fatal() { echo "[$(date +%H:%M:%S)] [FATAL] $*" >&2; exit 1; }

banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  printf "║  %-48s║\n" "$*"
  echo "╚══════════════════════════════════════════════════╝"
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------

SKIP_PREREQS=0
for arg in "$@"; do
  case "$arg" in
    --skip-prereqs) SKIP_PREREQS=1 ;;
    *) fatal "Unknown argument: $arg" ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required secrets
# ---------------------------------------------------------------------------

[[ -n "${POSTGRES_PASSWORD:-}"    ]] || fatal "POSTGRES_PASSWORD is not set — aborting."
[[ -n "${COMPLIANCE_JWT_SECRET:-}" ]] || fatal "COMPLIANCE_JWT_SECRET is not set — aborting."

# ---------------------------------------------------------------------------
# Run phases
# ---------------------------------------------------------------------------

banner "GhostStack Genesis Installer"
info "Base directory : ${BASE}"
info "Log file       : ${LOG_FILE}"
info "Date           : $(date)"

cd "${BASE}"

phase() {
  local script="${INSTALLER_DIR}/${1}"
  banner "Phase: ${1}"
  [[ -f "${script}" ]] || fatal "Phase script not found: ${script}"
  bash "${script}"
  info "Phase ${1} complete."
}

[[ "${SKIP_PREREQS}" -eq 1 ]] && info "Skipping configure.sh (--skip-prereqs)" || phase configure.sh

phase deploy_l1.sh
phase deploy_l2.sh
phase deploy_l3.sh
phase deploy_ghostbrain.sh
phase monitoring.sh
phase start_stack.sh

banner "GhostStack Deployment Complete"
info "Chain IDs:  L1=14000101  L2=901  L3=903"
info "RPC ports:  L1=18545  L2=29547  L3=39545"
info "GhostBrain: port 7900 (API)  7901 (mgmt)"
info "Grafana:    http://localhost:3000"
info "Log:        ${LOG_FILE}"
