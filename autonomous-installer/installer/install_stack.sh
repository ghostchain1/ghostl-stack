#!/usr/bin/env bash
# GhostStack Autonomous Self-Healing Infrastructure — Main Installer
#
# Runs the genesis installer then starts the GhostStack Guardian daemon.
# The daemon monitors, repairs, and reports on the full stack continuously.
#
# Usage:
#   cd /home/ghost/ghostl-stack
#   POSTGRES_PASSWORD=<s> COMPLIANCE_JWT_SECRET=<s> \
#     bash autonomous-installer/installer/install_stack.sh [--skip-genesis] [--skip-prereqs]
#
# Flags:
#   --skip-genesis   Skip genesis-installer/install.sh (stack already deployed)
#   --skip-prereqs   Pass through to configure.sh (skip apt installs)

set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DIR="$(cd "${INSTALLER_DIR}/.." && pwd)"
ROOT="$(cd "${AUTO_DIR}/.." && pwd)"

LOG_DIR="${ROOT}/logs"
GUARDIAN_PID_FILE="${ROOT}/.tmp/guardian.pid"

mkdir -p "${LOG_DIR}" "${ROOT}/.tmp"

# Tee to log file.
LOG_FILE="${LOG_DIR}/autonomous-install-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "${LOG_FILE}") 2>&1

info()  { echo "[$(date +%H:%M:%S)] [install_stack] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [install_stack] FATAL: $*" >&2; exit 1; }

banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  printf "║  %-48s║\n" "$*"
  echo "╚══════════════════════════════════════════════════╝"
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------

SKIP_GENESIS=0
GENESIS_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --skip-genesis)  SKIP_GENESIS=1 ;;
    --skip-prereqs)  GENESIS_ARGS+=(--skip-prereqs) ;;
    *) fatal "Unknown argument: ${arg}" ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required secrets (fail-closed)
# ---------------------------------------------------------------------------

[[ -n "${POSTGRES_PASSWORD:-}"     ]] || fatal "POSTGRES_PASSWORD is not set."
[[ -n "${COMPLIANCE_JWT_SECRET:-}" ]] || fatal "COMPLIANCE_JWT_SECRET is not set."

# ---------------------------------------------------------------------------
# Phase 1: Dependency check
# ---------------------------------------------------------------------------

banner "GhostStack Autonomous Installer"
info "Root    : ${ROOT}"
info "Log     : ${LOG_FILE}"

bash "${INSTALLER_DIR}/dependency_check.sh"

# ---------------------------------------------------------------------------
# Phase 2: Genesis install (unless already deployed)
# ---------------------------------------------------------------------------

if [[ "${SKIP_GENESIS}" -eq 0 ]]; then
  GENESIS_SCRIPT="${ROOT}/genesis-installer/install.sh"
  [[ -f "${GENESIS_SCRIPT}" ]] || fatal "genesis-installer/install.sh not found. Run genesis installer first."
  info "Running genesis installer…"
  bash "${GENESIS_SCRIPT}" "${GENESIS_ARGS[@]}"
else
  info "Skipping genesis install (--skip-genesis)."
fi

# ---------------------------------------------------------------------------
# Phase 3: Start the Guardian daemon
# ---------------------------------------------------------------------------

GUARDIAN="${AUTO_DIR}/daemon/ghoststack_guardian.sh"
[[ -f "${GUARDIAN}" ]] || fatal "Guardian daemon not found: ${GUARDIAN}"

# Stop any existing guardian before re-starting.
if [[ -f "${GUARDIAN_PID_FILE}" ]]; then
  OLD_PID="$(<"${GUARDIAN_PID_FILE}")"
  if kill -0 "${OLD_PID}" 2>/dev/null; then
    info "Stopping existing guardian (PID ${OLD_PID})…"
    kill -TERM "${OLD_PID}" 2>/dev/null || true
    sleep 2
  fi
  rm -f "${GUARDIAN_PID_FILE}"
fi

info "Starting GhostStack Guardian daemon…"
# Setsid ensures the guardian survives the installer's TTY.
nohup setsid bash "${GUARDIAN}" \
  >> "${LOG_DIR}/guardian.log" 2>&1 &
GUARDIAN_PID=$!
echo "${GUARDIAN_PID}" > "${GUARDIAN_PID_FILE}"

# Give daemon a moment to confirm it started.
sleep 2
if kill -0 "${GUARDIAN_PID}" 2>/dev/null; then
  info "Guardian running (PID ${GUARDIAN_PID})."
else
  fatal "Guardian failed to start. Check ${LOG_DIR}/guardian.log."
fi

banner "Autonomous Infrastructure Ready"
info "Guardian PID : ${GUARDIAN_PID}  (${GUARDIAN_PID_FILE})"
info "Guardian log : ${LOG_DIR}/guardian.log"
info "Stop daemon  : kill -TERM ${GUARDIAN_PID}"
info "Log          : ${LOG_FILE}"
