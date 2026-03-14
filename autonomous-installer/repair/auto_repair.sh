#!/usr/bin/env bash
# GhostStack Autonomous Installer — Auto-Repair Orchestrator
#
# Runs the full repair cycle:
#   1. container_repair.sh — restart stopped/unhealthy containers
#   2. health_monitor.sh   — verify the stack recovered
#
# Exit codes
#   0 — all critical services healthy after repair
#   1 — still degraded after repair attempt

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_DIR="${ROOT}/autonomous-installer/monitoring"
COOLDOWN_FILE="${ROOT}/.tmp/repair_cooldown.json"
REPORT_FILE="${ROOT}/.tmp/health_report.json"

info() { echo "[$(date +%H:%M:%S)] [auto_repair] $*"; }
warn() { echo "[$(date +%H:%M:%S)] [auto_repair] WARN  $*" >&2; }

# ---------------------------------------------------------------------------
# Per-container restart cooldown
# Stored as { "container_name": <unix_epoch_of_last_restart> }
# ---------------------------------------------------------------------------

REPAIR_COOLDOWN_S="${REPAIR_COOLDOWN_S:-120}"

mkdir -p "${ROOT}/.tmp"

cooldown_load() {
  if [[ -f "${COOLDOWN_FILE}" ]]; then
    cat "${COOLDOWN_FILE}"
  else
    echo '{}'
  fi
}

cooldown_is_ready() {
  local name="$1"
  local now
  now="$(date +%s)"
  local last
  last="$(cooldown_load | jq -r --arg n "${name}" '.[$n] // 0')"
  (( now - last >= REPAIR_COOLDOWN_S ))
}

cooldown_mark() {
  local name="$1"
  local now
  now="$(date +%s)"
  local updated
  updated="$(cooldown_load | jq --arg n "${name}" --argjson ts "${now}" '.[$n] = $ts')"
  echo "${updated}" > "${COOLDOWN_FILE}"
}

# ---------------------------------------------------------------------------
# Determine which containers are degraded from the most recent health report
# ---------------------------------------------------------------------------

get_degraded_containers() {
  if [[ ! -f "${REPORT_FILE}" ]]; then
    return
  fi
  jq -r '
    .containers
    | to_entries[]
    | select(.value != "running")
    | .key
  ' "${REPORT_FILE}" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Auto-Repair Cycle ==="

# 1 — Refresh health report so we have current state.
if ! bash "${MONITOR_DIR}/health_monitor.sh" > /dev/null 2>&1; then
  info "Health monitor reported degraded state — proceeding with repair."
else
  info "Stack is healthy — no repair needed."
  exit 0
fi

# 2 — Evaluate per-container cooldowns before issuing repairs.
SKIPPED=0
DUE=()
while IFS= read -r ctr; do
  [[ -z "${ctr}" ]] && continue
  if cooldown_is_ready "${ctr}"; then
    DUE+=("${ctr}")
    cooldown_mark "${ctr}"
  else
    warn "Container '${ctr}' is still within cooldown window — skipping."
    (( SKIPPED++ )) || true
  fi
done < <(get_degraded_containers)

if [[ "${#DUE[@]}" -eq 0 ]] && [[ "${SKIPPED}" -gt 0 ]]; then
  warn "All degraded containers are within their cooldown window. Waiting for next cycle."
  exit 1
fi

# 3 — Run container repair.
info "Triggering container repair (${#DUE[@]} container(s) due)…"
if ! bash "${SCRIPT_DIR}/container_repair.sh"; then
  warn "container_repair.sh exited non-zero — some repairs may have failed."
fi

# 4 — Re-run health monitor to verify recovery.
info "Verifying recovery…"
VERIFY_WAIT_S="${REPAIR_VERIFY_WAIT_S:-15}"
sleep "${VERIFY_WAIT_S}"

if bash "${MONITOR_DIR}/health_monitor.sh" > /dev/null 2>&1; then
  info "Recovery confirmed — all critical services healthy."
  exit 0
else
  warn "Stack still degraded after repair. Guardian will retry next cycle."
  exit 1
fi
