#!/usr/bin/env bash
# GhostStack Autonomous Installer — Container Repair
#
# Identifies containers that are stopped or unhealthy and restarts them
# using the GhostBrain Supervisor API's /action endpoint (which enforces
# the ALLOWED_ACTIONS allowlist on the server side).
#
# SAFETY INVARIANTS
# -----------------
# 1. Only containers in RESTARTABLE_CONTAINERS may be restarted.
#    Any name not in that allowlist is skipped with a warning.
# 2. No container is restarted more than MAX_RESTARTS_PER_CYCLE times
#    per guardian cycle (prevents restart storms).
# 3. All restart actions go through the Supervisor API POST /action —
#    never via direct `docker restart` in production mode.
#    DIRECT_DOCKER=1 enables fallback for environments where the
#    Supervisor is itself offline.
# 4. Container names from docker inspect are matched against an allowlist;
#    they are never interpolated into shell commands.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [container_repair] $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [container_repair] WARN  $*" >&2; }

SUPERVISOR_URL="${SUPERVISOR_API_URL:-http://localhost:9100}"
RELAY_TIMEOUT_S="${REPAIR_RELAY_TIMEOUT_S:-8}"
MAX_RESTARTS_PER_CYCLE="${REPAIR_MAX_RESTARTS:-3}"

# Fall back to direct docker restart only when Supervisor is offline
# (e.g. during initial boot before ghostbrain starts).
DIRECT_DOCKER="${DIRECT_DOCKER:-0}"

# ---------------------------------------------------------------------------
# Allowlisted restartable containers
# Names that may never be auto-restarted (require human intervention).
# ---------------------------------------------------------------------------

# Containers that the guardian is permitted to restart autonomously.
RESTARTABLE_CONTAINERS=(
  nats
  ghostbrain-postgres
  ghostbrain-redis
  ghost-compliance
  ghost-compliance-worker
  ghost-gas-engine
  ghost-gas-engine-worker
  ghost-guard
  ghost-rpc-proxy-l1
  ghost-rpc-proxy-l2
  ghost-rpc-proxy-l3
  hyper-ghost-supervisor
  ai-monitor
  prometheus
  alertmanager
  loki
  grafana
  governance-event-bridge
  ghost-health-aggregator
)

# Chain-layer containers require Supervisor approval — not direct restart.
GOVERNANCE_REQUIRED_CONTAINERS=(
  ghostchaind
  hermes-relayer
  ghost-exec-l2
  ghost-sequencer-l2
  ghost-deriver-l2
  ghost-settlement-l2
  ghost-bridge-l2
  ghost-proof-l2
  ghost-exec-l3
  ghost-sequencer-l3
  ghost-deriver-l3
  ghost-settlement-l3
  ghost-bridge-l3
  ghost-proof-l3
  ghostbrain-core
  ghostbrain-agent
  ghostbrain-cluster
)

is_restartable() {
  local name="$1"
  for allowed in "${RESTARTABLE_CONTAINERS[@]}"; do
    [[ "${allowed}" == "${name}" ]] && return 0
  done
  return 1
}

needs_governance() {
  local name="$1"
  for gov in "${GOVERNANCE_REQUIRED_CONTAINERS[@]}"; do
    [[ "${gov}" == "${name}" ]] && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# Restart via Supervisor API
# ---------------------------------------------------------------------------

restart_via_supervisor() {
  local container="$1"
  local resp
  resp="$(curl -sf --max-time "${RELAY_TIMEOUT_S}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg a "restart_container" --arg t "${container}" \
      '{"action":$a,"target":$t}')" \
    "${SUPERVISOR_URL}/action" 2>/dev/null)" || {
    warn "Supervisor API unreachable for ${container} restart."
    return 1
  }
  local ok
  ok="$(echo "${resp}" | jq -r '.ok // false' 2>/dev/null)"
  [[ "${ok}" == "true" ]]
}

# ---------------------------------------------------------------------------
# Restart via direct docker (fallback only)
# ---------------------------------------------------------------------------

restart_direct() {
  local container="$1"
  warn "DIRECT_DOCKER fallback: restarting ${container} without Supervisor."
  hg_docker restart "${container}"
}

# ---------------------------------------------------------------------------
# Submit governance proposal for chain-layer containers
# ---------------------------------------------------------------------------

submit_governance_restart() {
  local container="$1"
  local relay_url="${SIGNING_RELAY_URL:-http://localhost:7910}"
  info "Container '${container}' requires governance approval — submitting proposal."
  curl -sf --max-time "${RELAY_TIMEOUT_S}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data "$(jq -n \
      --arg id   "$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s)" \
      --arg ctr  "${container}" \
      '{"proposal_id":$id,"action":"restart_container","target":$ctr,
        "chain_id":14000101,"gas_token":"GST","from":"ghostbrain-guardian"}')" \
    "${relay_url}/relay/repair/propose" >/dev/null 2>&1 || {
    warn "Signing relay unavailable — governance proposal for ${container} not submitted."
  }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Container Repair ==="

hg_docker_init

RESTARTS=0

# Build list of non-running containers using JSON output from docker ps.
# Use docker ps -a with JSON format — never parse free-form status text.
OFFLINE_CTRS=()
while IFS= read -r ctr_json; do
  name="$(echo "${ctr_json}" | jq -r '.Names' | sed 's|^/||')"
  state="$(echo "${ctr_json}" | jq -r '.State')"
  health="$(echo "${ctr_json}" | jq -r '.Status')"

  # Filter: not running, or running but unhealthy.
  if [[ "${state}" != "running" ]] || [[ "${health}" == *"unhealthy"* ]]; then
    OFFLINE_CTRS+=("${name}")
  fi
done < <(hg_docker ps -a --format '{{json .}}' 2>/dev/null)

if [[ "${#OFFLINE_CTRS[@]}" -eq 0 ]]; then
  info "All containers healthy — nothing to repair."
  exit 0
fi

info "Containers needing attention: ${OFFLINE_CTRS[*]}"

for ctr in "${OFFLINE_CTRS[@]}"; do
  if [[ "${RESTARTS}" -ge "${MAX_RESTARTS_PER_CYCLE}" ]]; then
    warn "MAX_RESTARTS_PER_CYCLE (${MAX_RESTARTS_PER_CYCLE}) reached — deferring remaining repairs."
    break
  fi

  if needs_governance "${ctr}"; then
    submit_governance_restart "${ctr}"
    continue
  fi

  if ! is_restartable "${ctr}"; then
    warn "Container '${ctr}' is not in the restartable allowlist — skipping."
    continue
  fi

  info "Attempting restart of '${ctr}'…"

  if restart_via_supervisor "${ctr}"; then
    info "  ✓ Restarted '${ctr}' via Supervisor."
    RESTARTS=$(( RESTARTS + 1 ))
  elif [[ "${DIRECT_DOCKER}" == "1" ]]; then
    restart_direct "${ctr}"
    RESTARTS=$(( RESTARTS + 1 ))
  else
    warn "  ✗ Could not restart '${ctr}'. Set DIRECT_DOCKER=1 for fallback or check Supervisor."
  fi
done

info "Container repair complete (${RESTARTS} restart(s) issued)."
