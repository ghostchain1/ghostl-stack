#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostBrain AI Layer
#
# Starts the GhostBrain AI infrastructure:
#   Core services: ghostbrain-core (port 7900), ghostbrain-postgres, ghostbrain-redis, nats
#   Agent services: ghostbrain-agent, ghostbrain-cluster, ghostbrain-memory
#   Governance bridge: governance-event-bridge
#   Health: ghost-health-aggregator
#
# Compose file: docker-compose.ghostbrain.yml
# GhostBrain port:  7900 (API)  7901 (mgmt)
#
# AI SOVEREIGNTY INVARIANTS enforced here:
#   - AI may recommend on-chain actions; humans must ratify via governance.
#   - No service is granted autonomous signing authority.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/docker-compose.ghostbrain.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [deploy_ghostbrain] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [deploy_ghostbrain] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${GHOSTBRAIN_WAIT_S:-120}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# Core infrastructure services (must be healthy before agents start)
# ---------------------------------------------------------------------------

CORE_SERVICES=(
  nats
  ghostbrain-postgres
  ghostbrain-redis
  ghostbrain-core
)

# ---------------------------------------------------------------------------
# Agent and orchestration services
# ---------------------------------------------------------------------------

AGENT_SERVICES=(
  hypervisor-supervisor
  ghostbrain-agent
  ghostbrain-cluster
  ghostbrain-memory
  ghostbrain-infra
  governance-event-bridge
  ghost-health-aggregator
)

# ---------------------------------------------------------------------------
# Optional services (started but non-fatal if absent)
# ---------------------------------------------------------------------------

OPTIONAL_SERVICES=(
  ghost-helper-bots
  acg-planner
  acg-auditor
  acg-sentinel
  hyper-ghost-ai
  ghostbrain-gsa
  host-orchestrator-ai
)

# ---------------------------------------------------------------------------
# Wait for GhostBrain API
# ---------------------------------------------------------------------------

wait_for_ghostbrain() {
  info "Waiting for GhostBrain API on port 7900 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf http://localhost:7900/health >/dev/null 2>&1 || \
        curl -sf http://localhost:7900/healthz >/dev/null 2>&1; do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      fatal "GhostBrain API did not become ready within ${WAIT_TIMEOUT_S}s."
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "GhostBrain API ready (${elapsed}s)."
}

# ---------------------------------------------------------------------------
# Start a service, tolerating absence (optional services)
# ---------------------------------------------------------------------------

start_optional() {
  local svc="$1"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d "${svc}" 2>/dev/null || {
    info "  Optional service '${svc}' not available — skipping."
  }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Deploying GhostBrain AI Layer ==="
info "Compose file: ${COMPOSE_FILE}"

[[ -f "${COMPOSE_FILE}" ]] || fatal "Compose file not found: ${COMPOSE_FILE}"

hg_docker_init

cd "${ROOT}"

info "Pulling GhostBrain images…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" pull --quiet 2>&1 | tail -5 || true

# Start core services first.
info "Starting core infrastructure services…"
for svc in "${CORE_SERVICES[@]}"; do
  info "  Starting ${svc}…"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d "${svc}"
done

wait_for_ghostbrain

# Start agent services.
info "Starting agent services…"
for svc in "${AGENT_SERVICES[@]}"; do
  info "  Starting ${svc}…"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d "${svc}" || {
    info "  '${svc}' not available in compose file — skipping."
  }
done

# Start optional services.
info "Starting optional services…"
for svc in "${OPTIONAL_SERVICES[@]}"; do
  start_optional "${svc}"
done

info "GhostBrain AI layer deployed."
info "  API port  : 7900"
info "  Mgmt port : 7901"
info "  NATS      : 4222"
info "  Governance bridge active — AI proposals require human ratification."
