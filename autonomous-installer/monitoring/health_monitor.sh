#!/usr/bin/env bash
# GhostStack Autonomous Installer — Health Monitor
#
# Probes every critical GhostStack subsystem and reports status.
# Called by ghoststack_guardian.sh on each monitoring cycle.
#
# Probes (in order):
#   1. L1 EVM RPC (port 18545)  — ghost_blockNumber
#   2. L2 EVM RPC (port 29547)  — ghost_blockNumber
#   3. L3 EVM RPC (port 39545)  — ghost_blockNumber
#   4. GhostBrain Supervisor     — GET :9100/status
#   5. GhostBrain Core API       — GET :7900/health  (or /healthz)
#   6. Compliance API            — GET :8090/health
#   7. Prometheus                — GET :9090/-/ready
#   8. Docker container states   — docker inspect (no parsing of free-form ps text)
#
# Writes a JSON health report to HEALTH_REPORT_FILE and exits 0 if all
# critical probes pass, 1 if any critical probe fails.
#
# Optionally posts a JSON summary to the GhostBrain Supervisor API (:9100/action
# is for commands; use GET :9100/status to confirm supervisor is alive — health
# events are logged by the guardian, not pushed here to avoid feedback loops).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [health] $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [health] WARN  $*" >&2; }

HEALTH_REPORT_FILE="${ROOT}/.tmp/health_report.json"
PROBE_TIMEOUT_S="${HEALTH_PROBE_TIMEOUT_S:-5}"
SUPERVISOR_URL="${SUPERVISOR_API_URL:-http://localhost:9100}"
GHOSTBRAIN_URL="${GHOSTBRAIN_API_URL:-http://localhost:7900}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

mkdir -p "${ROOT}/.tmp"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

OVERALL_OK=1  # set to 0 on any critical failure

declare -A PROBE_STATUS

rpc_block_number() {
  # Returns decimal block height, or empty string on failure.
  local url="$1"
  local result
  result="$(curl -sf --max-time "${PROBE_TIMEOUT_S}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "${url}" 2>/dev/null)" || { echo ""; return; }
  # Extract hex result and convert to decimal, or bail.
  local hex
  hex="$(echo "${result}" | jq -r '.result // empty' 2>/dev/null)" || { echo ""; return; }
  printf '%d' "${hex}" 2>/dev/null || echo ""
}

http_ok() {
  curl -sf --max-time "${PROBE_TIMEOUT_S}" "$1" >/dev/null 2>&1
}

probe() {
  local name="$1" critical="$2" label="$3" result="$4"
  if [[ "${result}" == "ok" || -n "${result}" ]]; then
    PROBE_STATUS["${name}"]="ok:${result}"
    info "  ✓ ${label}"
  else
    PROBE_STATUS["${name}"]="fail"
    if [[ "${critical}" == "1" ]]; then
      warn "  ✗ ${label} [CRITICAL]"
      OVERALL_OK=0
    else
      warn "  ✗ ${label} [warning]"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Chain RPC probes
# ---------------------------------------------------------------------------

check_chains() {
  info "── Chain RPC probes ──"

  local h1 h2 h3
  h1="$(rpc_block_number http://localhost:18545)"
  h2="$(rpc_block_number http://localhost:29547)"
  h3="$(rpc_block_number http://localhost:39545)"

  probe "l1_rpc" "1" "GhostChain L1 :18545 (block=${h1:-?})" "${h1}"
  probe "l2_rpc" "1" "GhostL2       :29547 (block=${h2:-?})" "${h2}"
  probe "l3_rpc" "1" "GhostL3       :39545 (block=${h3:-?})" "${h3}"
}

# ---------------------------------------------------------------------------
# Service API probes
# ---------------------------------------------------------------------------

check_apis() {
  info "── Service API probes ──"

  # Supervisor
  local sv_ok=""
  http_ok "${SUPERVISOR_URL}/status" && sv_ok="ok"
  probe "supervisor" "1" "GhostBrain Supervisor :9100" "${sv_ok}"

  # GhostBrain core (try both health endpoints)
  local gb_ok=""
  http_ok "${GHOSTBRAIN_URL}/health"  && gb_ok="ok"
  [[ -z "${gb_ok}" ]] && http_ok "${GHOSTBRAIN_URL}/healthz" && gb_ok="ok"
  probe "ghostbrain_core" "1" "GhostBrain Core :7900" "${gb_ok}"

  # Compliance
  local comp_ok=""
  http_ok "http://localhost:8090/health" && comp_ok="ok"
  probe "compliance" "0" "Compliance API :8090" "${comp_ok}"

  # Prometheus
  local prom_ok=""
  http_ok "http://localhost:9090/-/ready" && prom_ok="ok"
  probe "prometheus" "0" "Prometheus :9090" "${prom_ok}"
}

# ---------------------------------------------------------------------------
# Docker container state probes (allowlisted set, no shell injection)
# ---------------------------------------------------------------------------

CRITICAL_CONTAINERS=(
  ghostchaind
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
  ghostbrain-postgres
  ghostbrain-redis
  nats
)

NON_CRITICAL_CONTAINERS=(
  prometheus
  grafana
  loki
  alertmanager
  ghost-compliance
  ghost-gas-engine
  ghost-guard
  ghost-observability
  governance-event-bridge
)

check_containers() {
  info "── Docker container probes ──"

  # Use docker inspect with JSON output — no parsing of free-form status text.
  hg_docker_init

  for ctr in "${CRITICAL_CONTAINERS[@]}"; do
    local state
    state="$(hg_docker inspect --format '{{.State.Status}}' "${ctr}" 2>/dev/null || echo "missing")"
    if [[ "${state}" == "running" ]]; then
      PROBE_STATUS["ctr:${ctr}"]="ok:running"
      info "  ✓ ${ctr} (running)"
    else
      PROBE_STATUS["ctr:${ctr}"]="fail:${state}"
      warn "  ✗ ${ctr} [${state}] [CRITICAL]"
      OVERALL_OK=0
    fi
  done

  for ctr in "${NON_CRITICAL_CONTAINERS[@]}"; do
    local state
    state="$(hg_docker inspect --format '{{.State.Status}}' "${ctr}" 2>/dev/null || echo "missing")"
    if [[ "${state}" == "running" ]]; then
      info "  ✓ ${ctr} (running)"
    else
      warn "  ✗ ${ctr} [${state}]"
    fi
  done
}

# ---------------------------------------------------------------------------
# Write JSON report
# ---------------------------------------------------------------------------

write_report() {
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local overall
  overall="$( [[ "${OVERALL_OK}" -eq 1 ]] && echo "healthy" || echo "degraded" )"

  # Build JSON probe array using jq — never by string concatenation.
  local pairs=()
  for key in "${!PROBE_STATUS[@]}"; do
    pairs+=("$(jq -n --arg k "${key}" --arg v "${PROBE_STATUS[$key]}" '{"probe":$k,"result":$v}')")
  done

  local probes_json="[]"
  if [[ "${#pairs[@]}" -gt 0 ]]; then
    probes_json="$(printf '%s\n' "${pairs[@]}" | jq -s '.')"
  fi

  jq -n \
    --arg ts "${now}" \
    --arg status "${overall}" \
    --argjson probes "${probes_json}" \
    '{"timestamp":$ts,"status":$status,"probes":$probes}' \
    > "${HEALTH_REPORT_FILE}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Health Monitor ==="

check_chains
check_apis
check_containers
write_report

if [[ "${OVERALL_OK}" -eq 1 ]]; then
  info "Overall status: HEALTHY → ${HEALTH_REPORT_FILE}"
  exit 0
else
  warn "Overall status: DEGRADED → ${HEALTH_REPORT_FILE}"
  exit 1
fi
