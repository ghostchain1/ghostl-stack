#!/usr/bin/env bash
# GhostStack Genesis Installer — Start Remaining Stack Services
#
# Starts the compliance/API/web tier and the full OP Stack service mesh.
# Run AFTER L1, L2, L3, GhostBrain, and monitoring are healthy.
#
# Services started:
#   Compliance tier : postgres, redis, migrate, ghost-compliance (docker-compose.yml)
#   OP Stack mesh   : ghost-guard, ghost-rpc-proxy-l*, hyper-ghost-supervisor,
#                     gas-engine, op-gate (infra/opstack/docker-compose.yml)
#   Sovereign econ  : l3-fee-collector, l2-revenue-aggregator, treasury-engine,
#                     reward-distributor, hyper-ghost-governor (docker-compose.sovereign.yml)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

# Compose files in start order.
COMPLIANCE_COMPOSE="${ROOT}/docker-compose.yml"
OPSTACK_COMPOSE="${ROOT}/infra/opstack/docker-compose.yml"
SOVEREIGN_COMPOSE="${ROOT}/docker-compose.sovereign.yml"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [start_stack] $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [start_stack] WARN: $*" >&2; }
fatal() { echo "[$(date +%H:%M:%S)] [start_stack] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${STACK_WAIT_S:-120}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# Compliance tier services (docker-compose.yml)
# ---------------------------------------------------------------------------

COMPLIANCE_SERVICES=(
  postgres
  redis
  migrate
  ghost-compliance
  ghost-compliance-worker
)

# ---------------------------------------------------------------------------
# OP Stack mesh services (infra/opstack/docker-compose.yml)
# Order matters: RPC proxies before guard, guard before op-gate.
# ---------------------------------------------------------------------------

OPSTACK_SERVICES=(
  ghost-rpc-proxy-l1
  ghost-rpc-proxy-l2
  ghost-rpc-proxy-l3
  gas-engine-postgres
  gas-engine-redis
  ghost-gas-engine
  ghost-gas-engine-worker
  ghost-guard
  hyper-ghost-supervisor
  ai-monitor
  op-gate
  op-gate-l1
)

# ---------------------------------------------------------------------------
# Sovereign economy services (docker-compose.sovereign.yml)
# ---------------------------------------------------------------------------

SOVEREIGN_SERVICES=(
  l3-fee-collector
  l2-revenue-aggregator
  treasury-engine
  reward-distributor
  hyper-ghost-governor
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

start_services() {
  local compose_file="$1"; shift
  local services=("$@")

  if [[ ! -f "${compose_file}" ]]; then
    warn "Compose file not found: ${compose_file} — skipping."
    return 0
  fi

  for svc in "${services[@]}"; do
    info "  Starting ${svc}…"
    hg_docker compose \
      -f "${compose_file}" \
      -p "${PROJECT_NAME}" \
      up -d "${svc}" 2>/dev/null || warn "  '${svc}' not available — skipping."
  done
}

wait_for_compliance() {
  info "Waiting for ghost-compliance API on port 8090 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf http://localhost:8090/health >/dev/null 2>&1; do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      warn "ghost-compliance did not become ready within ${WAIT_TIMEOUT_S}s — continuing."
      return 0
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "ghost-compliance ready (${elapsed}s)."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Starting Full GhostStack ==="

hg_docker_init
cd "${ROOT}"

info "-- Compliance tier --"
start_services "${COMPLIANCE_COMPOSE}" "${COMPLIANCE_SERVICES[@]}"
wait_for_compliance

info "-- OP Stack service mesh --"
start_services "${OPSTACK_COMPOSE}" "${OPSTACK_SERVICES[@]}"

info "-- Sovereign economy services --"
start_services "${SOVEREIGN_COMPOSE}" "${SOVEREIGN_SERVICES[@]}"

info "All services started."

# ---------------------------------------------------------------------------
# Final status overview
# ---------------------------------------------------------------------------

info "=== Service Status Overview ==="
if hg_docker compose -f "${COMPLIANCE_COMPOSE}" -p "${PROJECT_NAME}" ps 2>/dev/null; then
  true
fi
if hg_docker compose -f "${OPSTACK_COMPOSE}" -p "${PROJECT_NAME}" ps 2>/dev/null; then
  true
fi

info "GhostStack is running."
info "  Compliance API : http://localhost:8090"
info "  RPC L1         : http://localhost:18545"
info "  RPC L2         : http://localhost:29547"
info "  RPC L3         : http://localhost:39545"
info "  GhostBrain     : http://localhost:7900"
info "  Grafana        : http://localhost:3000"
