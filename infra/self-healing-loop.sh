#!/usr/bin/env bash
# GhostStack Self-Healing Supervisor Loop
#
# Runs continuously, monitoring critical GhostStack services and
# automatically restarting any that have stopped.
#
# Monitored:
#   - Docker containers (ghostchaind, L2/L3 op-geth, AI services, compliance)
#   - RPC endpoints (L1/L2/L3 chain health via eth_chainId)
#   - GhostBrain AI core (port 7900)
#
# Called by genesis-installer-v2.sh Phase 12 (wrapped in a restart loop).
# Can also be run directly for debugging: bash infra/self-healing-loop.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Configuration ─────────────────────────────────────────────────────────────
HEAL_INTERVAL="${HEAL_INTERVAL:-30}"       # seconds between health checks
RPC_TIMEOUT="${RPC_TIMEOUT:-5}"            # curl timeout per RPC check
MAX_RESTART_BACKOFF="${MAX_RESTART_BACKOFF:-300}"  # max seconds before alerting

L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:29547}"
L3_RPC="${L3_RPC:-http://localhost:39545}"
GHOSTBRAIN_URL="${GHOSTBRAIN_URL:-http://localhost:7900/health}"
PROTOCOL_ARCHITECT_URL="${PROTOCOL_ARCHITECT_URL:-http://localhost:7910/healthz}"
DEFI_ARCHITECT_URL="${DEFI_ARCHITECT_URL:-http://localhost:7920/healthz}"
GOVERNOR_AI_URL="${GOVERNOR_AI_URL:-http://localhost:7930/healthz}"
INFRA_CONTROLLER_URL="${INFRA_CONTROLLER_URL:-http://localhost:7940/healthz}"
MULTICHAIN_CONTROLLER_URL="${MULTICHAIN_CONTROLLER_URL:-http://localhost:7950/healthz}"

# Containers that must stay running (restart if stopped)
# Format: "container_name:compose_service_name" or just "container_name"
CRITICAL_CONTAINERS=(
  "ghostchaind"                  # GhostChain L1 (ghostchaind sovereign node)
  "ghost-compliance"             # Compliance service (port 8090)
  "ghost-prometheus"             # Prometheus (port 9090)
  "ghost-protocol-architect"     # Protocol Architect AI (port 7910)
  "ghost-defi-architect"         # DeFi Architect AI (port 7920)
  "ghost-governor-ai"            # Governor AI (port 7930)
  "ghost-infra-controller"       # Infra Controller (port 7940)
  "ghost-multichain-controller"  # Multichain Controller (port 7950)
)

# Docker Compose services to restart via `compose up -d <service>` if down
COMPOSE_SERVICES=(
  "ghost-compliance"
  "migrate"
)

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [SUPERVISOR] $*"; }
warn() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [WARN]       $*" >&2; }

# Track consecutive failures per service for backoff alerting
declare -A FAIL_COUNT=()

record_fail() {
  local svc="$1"
  FAIL_COUNT["${svc}"]=$(( ${FAIL_COUNT["${svc}"]:-0} + 1 ))
}

clear_fail() {
  local svc="$1"
  FAIL_COUNT["${svc}"]=0
}

alert_if_repeated() {
  local svc="$1" threshold="${2:-5}"
  local count="${FAIL_COUNT["${svc}"]:-0}"
  if (( count >= threshold )); then
    warn "SERVICE ${svc} has failed ${count} consecutive health checks – manual intervention may be required."
  fi
}

# ── Container Health Check + Restart ─────────────────────────────────────────
check_container() {
  local name="$1"

  # Is the container known to Docker at all?
  if ! docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
    log "  ${name}: container not found – skipping."
    return
  fi

  # Is it running?
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
    warn "${name} is NOT running – attempting restart…"
    if docker restart "${name}" 2>/dev/null; then
      log "  ${name}: restarted successfully."
      clear_fail "${name}"
    else
      warn "${name}: restart FAILED."
      record_fail "${name}"
      alert_if_repeated "${name}"
    fi
  else
    clear_fail "${name}"
  fi
}

# ── RPC Health Check ──────────────────────────────────────────────────────────
check_rpc() {
  local label="$1" url="$2" expected_chain_id_hex="$3"

  local result
  result="$(curl -sS --max-time "${RPC_TIMEOUT}" -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    2>/dev/null || true)"

  if echo "${result}" | grep -qi "${expected_chain_id_hex}"; then
    clear_fail "${label}"
    return 0
  fi

  warn "${label} RPC not healthy (url=${url})"
  record_fail "${label}"
  alert_if_repeated "${label}" 3
  return 1
}

# ── HTTP Service Health Check ─────────────────────────────────────────────────
check_http() {
  local label="$1" url="$2"
  if curl -fsS --max-time "${RPC_TIMEOUT}" "${url}" &>/dev/null; then
    clear_fail "${label}"
    return 0
  fi
  warn "${label} not responding (url=${url})"
  record_fail "${label}"
  alert_if_repeated "${label}" 3
  return 1
}

# ── Docker Compose Service Heal ───────────────────────────────────────────────
heal_compose_service() {
  local svc="$1"
  cd "${STACK_ROOT}"
  if ! docker compose ps --format '{{.Service}}:{{.Status}}' 2>/dev/null \
      | grep "^${svc}:" | grep -qi "running"; then
    warn "${svc} compose service not running – attempting up…"
    if docker compose up -d "${svc}" 2>/dev/null; then
      log "  ${svc}: compose service restored."
      clear_fail "compose:${svc}"
    else
      warn "${svc}: compose up FAILED."
      record_fail "compose:${svc}"
      alert_if_repeated "compose:${svc}" 3
    fi
  fi
}

# ── Main Loop ─────────────────────────────────────────────────────────────────
log "Self-healing supervisor started (interval=${HEAL_INTERVAL}s, PID=$$)"

while true; do
  log "── Health check cycle ──"

  # 1. Critical named containers
  for ctr in "${CRITICAL_CONTAINERS[@]}"; do
    check_container "${ctr}"
  done

  # 2. Docker Compose services
  for svc in "${COMPOSE_SERVICES[@]}"; do
    heal_compose_service "${svc}" || true
  done

  # 3. Chain RPC endpoints
  check_rpc "L1(14000101)" "${L1_RPC}" "0xd59a65" || true
  check_rpc "L2(901)"      "${L2_RPC}" "0x385"     || true
  check_rpc "L3(903)"      "${L3_RPC}" "0x387"     || true

  # 4. AI services
  check_http "GhostBrain(7900)"         "${GHOSTBRAIN_URL}"           || true
  check_http "ProtocolArchitect(7910)"  "${PROTOCOL_ARCHITECT_URL}"   || true
  check_http "DeFiArchitect(7920)"      "${DEFI_ARCHITECT_URL}"       || true
  check_http "GovernorAI(7930)"         "${GOVERNOR_AI_URL}"          || true
  check_http "InfraController(7940)"    "${INFRA_CONTROLLER_URL}"     || true
  check_http "MultichainCtrl(7950)"     "${MULTICHAIN_CONTROLLER_URL}" || true

  log "── Cycle complete – sleeping ${HEAL_INTERVAL}s ──"
  sleep "${HEAL_INTERVAL}"
done
