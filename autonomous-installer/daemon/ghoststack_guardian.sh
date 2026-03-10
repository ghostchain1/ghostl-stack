#!/usr/bin/env bash
# GhostStack Autonomous Installer — Stack Guardian Daemon
#
# Long-running supervisor that orchestrates the full self-healing cycle:
#
#   Every cycle (GUARDIAN_INTERVAL_S, default 30s):
#     1. Collect metrics     (metrics_collector.sh)
#     2. Health check        (health_monitor.sh)
#     3. Auto-repair         (auto_repair.sh)  — only when health != 0
#
#   Every SCALE_CHECK_CYCLES (default 6 cycles ≈ 3 min):
#     4. Autoscale proposal  (autoscale_nodes.sh)
#
#   Every VALIDATOR_CHECK_CYCLES (default 12 cycles ≈ 6 min):
#     5. Validator rebalance (validator_rebalance.sh)
#
#   Every UPGRADE_CHECK_CYCLES (default 120 cycles ≈ 1 hr):
#     6. Upgrade check       (upgrade_services.sh)
#
# SAFETY INVARIANTS
# -----------------
# 1. Graceful shutdown on SIGTERM/SIGINT — writes final status before exit.
# 2. PID file prevents duplicate guardian instances.
# 3. Log rotation at LOG_MAX_BYTES (default 10 MB).
# 4. All child scripts run in a subshell with their own exit codes captured.
#    A child failure does NOT crash the guardian — only logs + continues.
# 5. Guardian itself does NOT restart containers or modify chain state.
#    It delegates all actions to child scripts, each with their own guards.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

INSTALLER_DIR="${ROOT}/autonomous-installer"
MONITOR_DIR="${INSTALLER_DIR}/monitoring"
REPAIR_DIR="${INSTALLER_DIR}/repair"
SCALING_DIR="${INSTALLER_DIR}/scaling"
UPGRADE_DIR="${INSTALLER_DIR}/upgrades"

TMP_DIR="${ROOT}/.tmp"
LOG_DIR="${ROOT}/logs"
PID_FILE="${TMP_DIR}/guardian.pid"
LOG_FILE="${LOG_DIR}/guardian.log"
STATUS_FILE="${TMP_DIR}/guardian_status.json"

mkdir -p "${TMP_DIR}" "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Logging — all guardian output goes to stdout AND the log file.
# ---------------------------------------------------------------------------

exec > >(tee -a "${LOG_FILE}") 2>&1

info()  { echo "[$(date +%H:%M:%S)] [guardian] $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [guardian] WARN  $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [guardian] FATAL $*"; exit 1; }

# ---------------------------------------------------------------------------
# Configuration (all overridable via environment)
# ---------------------------------------------------------------------------

GUARDIAN_INTERVAL_S="${GUARDIAN_INTERVAL_S:-30}"
SCALE_CHECK_CYCLES="${SCALE_CHECK_CYCLES:-6}"
VALIDATOR_CHECK_CYCLES="${VALIDATOR_CHECK_CYCLES:-12}"
UPGRADE_CHECK_CYCLES="${UPGRADE_CHECK_CYCLES:-120}"
LOG_MAX_BYTES="${LOG_MAX_BYTES:-10485760}"  # 10 MB

# ---------------------------------------------------------------------------
# PID file management
# ---------------------------------------------------------------------------

acquire_pid_lock() {
  if [[ -f "${PID_FILE}" ]]; then
    OLD_PID="$(cat "${PID_FILE}")"
    if kill -0 "${OLD_PID}" 2>/dev/null; then
      fatal "Guardian already running (PID ${OLD_PID}). Remove ${PID_FILE} to force restart."
    fi
    warn "Stale PID file (PID ${OLD_PID} not running) — removing."
    rm -f "${PID_FILE}"
  fi
  echo "$$" > "${PID_FILE}"
  info "Guardian started (PID $$)."
}

release_pid_lock() {
  rm -f "${PID_FILE}"
}

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------

RUNNING=1

_shutdown() {
  RUNNING=0
  info "Shutdown signal received — finishing current cycle then exiting."
}

trap '_shutdown' SIGTERM SIGINT SIGQUIT

# ---------------------------------------------------------------------------
# Log rotation
# ---------------------------------------------------------------------------

rotate_log_if_needed() {
  if [[ -f "${LOG_FILE}" ]]; then
    local sz
    sz="$(stat -c%s "${LOG_FILE}" 2>/dev/null || echo 0)"
    if (( sz >= LOG_MAX_BYTES )); then
      mv "${LOG_FILE}" "${LOG_FILE}.1"
      : > "${LOG_FILE}"  # create fresh, empty log
      # Re-attach tee to the new file (exec approach updates the fd).
      exec > >(tee -a "${LOG_FILE}") 2>&1
      info "Log rotated (was ${sz} bytes)."
    fi
  fi
}

# ---------------------------------------------------------------------------
# Status file helper
# Writes guardian_status.json — consumed by the Supervisor / GhostBrain API.
# ---------------------------------------------------------------------------

write_status() {
  local cycle="$1"
  local healthy="$2"   # 0 or 1
  local repaired="$3"  # 0 or 1 (was repair attempted and succeeded?)
  jq -n \
    --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson cyc  "${cycle}" \
    --argjson pid  "$$" \
    --argjson ok   "${healthy}" \
    --argjson rep  "${repaired}" \
    '{
      guardian_pid: $pid,
      timestamp: $ts,
      cycle: $cyc,
      healthy: ($ok == 1),
      repair_attempted: ($rep == 1),
      interval_s: '"${GUARDIAN_INTERVAL_S}"',
      scale_check_cycles: '"${SCALE_CHECK_CYCLES}"',
      validator_check_cycles: '"${VALIDATOR_CHECK_CYCLES}"',
      upgrade_check_cycles: '"${UPGRADE_CHECK_CYCLES}"'
    }' > "${STATUS_FILE}"
}

# ---------------------------------------------------------------------------
# Safe script runner — captures exit code, never propagates failure upward.
# ---------------------------------------------------------------------------

run_script() {
  local label="$1"
  local script="$2"
  shift 2
  local args=("$@")

  info "→ ${label}"
  local rc=0
  bash "${script}" "${args[@]}" || rc=$?
  if [[ "${rc}" -ne 0 ]]; then
    warn "${label} exited with code ${rc}."
  fi
  return "${rc}"
}

# ---------------------------------------------------------------------------
# Main guardian loop
# ---------------------------------------------------------------------------

acquire_pid_lock

info "==================================================="
info "  GhostStack Guardian  (interval=${GUARDIAN_INTERVAL_S}s)"
info "==================================================="
info "  PID:             $$"
info "  Log:             ${LOG_FILE}"
info "  Status:          ${STATUS_FILE}"
info "  Scale check:     every ${SCALE_CHECK_CYCLES} cycles"
info "  Validator check: every ${VALIDATOR_CHECK_CYCLES} cycles"
info "  Upgrade check:   every ${UPGRADE_CHECK_CYCLES} cycles"
info "==================================================="

CYCLE=0

# Ensure RUNNING is checked before sleeping so a signal during the sleep
# terminates the loop cleanly.
while [[ "${RUNNING}" -eq 1 ]]; do
  CYCLE=$(( CYCLE + 1 ))
  info "--- Cycle ${CYCLE} ---"

  rotate_log_if_needed

  # 1. Collect metrics (continue even if this fails).
  run_script "Metrics collector"  "${MONITOR_DIR}/metrics_collector.sh" || true

  # 2. Health monitor — capture exit code to decide on repair.
  HEALTH_OK=1
  run_script "Health monitor" "${MONITOR_DIR}/health_monitor.sh" || HEALTH_OK=0

  # 3. Auto-repair — only when health check flagged a problem.
  REPAIRED=0
  if [[ "${HEALTH_OK}" -eq 0 ]]; then
    warn "Stack degraded — triggering auto-repair."
    if run_script "Auto-repair" "${REPAIR_DIR}/auto_repair.sh"; then
      REPAIRED=1
      HEALTH_OK=1
    fi
  fi

  # 4. Scaling check (every SCALE_CHECK_CYCLES cycles).
  if (( CYCLE % SCALE_CHECK_CYCLES == 0 )); then
    run_script "Autoscale nodes" "${SCALING_DIR}/autoscale_nodes.sh" || true
  fi

  # 5. Validator rebalance (every VALIDATOR_CHECK_CYCLES cycles).
  if (( CYCLE % VALIDATOR_CHECK_CYCLES == 0 )); then
    run_script "Validator rebalance" "${SCALING_DIR}/validator_rebalance.sh" || true
  fi

  # 6. Upgrade check (every UPGRADE_CHECK_CYCLES cycles).
  if (( CYCLE % UPGRADE_CHECK_CYCLES == 0 )); then
    run_script "Upgrade services" "${UPGRADE_DIR}/upgrade_services.sh" || true
  fi

  write_status "${CYCLE}" "${HEALTH_OK}" "${REPAIRED}"

  # Sleep in the background and wait so SIGTERM can interrupt the wait.
  [[ "${RUNNING}" -eq 1 ]] || break
  sleep "${GUARDIAN_INTERVAL_S}" &
  SLEEP_PID=$!
  wait "${SLEEP_PID}" || true
done

info "Guardian shutting down cleanly after cycle ${CYCLE}."
write_status "${CYCLE}" 0 0
release_pid_lock
info "Guardian exited."
