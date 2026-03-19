#!/usr/bin/env bash
# GhostStack Genesis Installer — Start Remaining Stack Services
#
# Starts the compliance/API/web tier and the Ghost-native control plane.
# Run AFTER L1, L2, L3, GhostBrain, and monitoring are healthy.
#
# Services started:
#   Compliance tier : postgres, redis, migrate, ghost-compliance (docker-compose.yml)
#   Control plane   : ghost-mapper, ghost-registry, ghost-guard, ai-monitor,
#                     bridge-service, liquidity-service (docker-compose.phase3.yml)
#   Observability   : loki, prometheus, alertmanager, grafana (observability/infra/docker-compose.yml)
#   Sovereign econ  : l3-fee-collector, l2-revenue-aggregator, treasury-engine,
#                     reward-distributor, hyper-ghost-governor (docker-compose.sovereign.yml)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

# Compose files in start order.
COMPLIANCE_COMPOSE="${ROOT}/docker-compose.yml"
CONTROL_PLANE_COMPOSE="${ROOT}/docker-compose.phase3.yml"
OBSERVABILITY_COMPOSE="${ROOT}/observability/infra/docker-compose.yml"
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
# Ghost-native control-plane services (docker-compose.phase3.yml)
# Order matters: mapper before registry/guard, then monitors and bridge UX.
# ---------------------------------------------------------------------------

CONTROL_PLANE_SERVICES=(
  ghost-mapper
  ghost-registry
  ghost-guard
  ai-monitor
  bridge-service
  liquidity-service
)

# ---------------------------------------------------------------------------
# Observability services (observability/infra/docker-compose.yml)
# ---------------------------------------------------------------------------

OBSERVABILITY_SERVICES=(
  loki
  prometheus
  alertmanager
  grafana
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

ensure_docker_network() {
  local name="$1"
  if hg_docker network inspect "${name}" >/dev/null 2>&1; then
    return 0
  fi
  info "Ensuring Docker network '${name}' exists…"
  hg_docker network create "${name}" >/dev/null
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
ensure_docker_network "ghost-rollup"

info "-- Compliance tier --"
start_services "${COMPLIANCE_COMPOSE}" "${COMPLIANCE_SERVICES[@]}"
wait_for_compliance

info "-- Observability --"
start_services "${OBSERVABILITY_COMPOSE}" "${OBSERVABILITY_SERVICES[@]}"

info "-- Ghost-native control plane --"
start_services "${CONTROL_PLANE_COMPOSE}" "${CONTROL_PLANE_SERVICES[@]}"

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
if hg_docker compose -f "${OBSERVABILITY_COMPOSE}" -p "${PROJECT_NAME}" ps 2>/dev/null; then
  true
fi
if hg_docker compose -f "${CONTROL_PLANE_COMPOSE}" -p "${PROJECT_NAME}" ps 2>/dev/null; then
  true
fi

info "GhostStack is running."
info "  Compliance API : http://localhost:8090"
info "  RPC L1         : http://localhost:18545"
info "  RPC L2         : http://localhost:29547"
info "  RPC L3         : http://localhost:39545"
info "  GhostBrain     : http://localhost:7900"
info "  Grafana        : http://localhost:3000"
