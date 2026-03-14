#!/usr/bin/env bash
# GhostStack Genesis Installer — Monitoring Stack
#
# Starts Prometheus, Grafana, Loki, and Alertmanager from the OP Stack
# observability compose file (infra/opstack/docker-compose.yml).
#
# Ports:
#   Prometheus  : 9090
#   Grafana     : 3000  (default login: admin / change on first boot)
#   Loki        : 3100
#   Alertmanager: 9093

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/opstack/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [monitoring] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [monitoring] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${MONITORING_WAIT_S:-90}"
HEALTH_RETRY_INTERVAL_S=5

MONITORING_SERVICES=(
  prometheus
  alertmanager
  loki
  grafana
)

# ---------------------------------------------------------------------------
# Wait for Prometheus to be healthy
# ---------------------------------------------------------------------------

wait_for_prometheus() {
  info "Waiting for Prometheus on port 9090 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf http://localhost:9090/-/ready >/dev/null 2>&1; do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      warn "Prometheus did not become ready within ${WAIT_TIMEOUT_S}s — continuing anyway."
      return 0
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "Prometheus ready (${elapsed}s)."
}

warn() { echo "[$(date +%H:%M:%S)] [monitoring] WARN: $*" >&2; }

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Deploying Monitoring Stack ==="
info "Compose file: ${COMPOSE_FILE}"

[[ -f "${COMPOSE_FILE}" ]] || fatal "Compose file not found: ${COMPOSE_FILE}"

hg_docker_init

cd "${ROOT}"

info "Pulling monitoring images…"
hg_docker compose \
  -f "${COMPOSE_FILE}" \
  -p "${PROJECT_NAME}" \
  pull --quiet prometheus alertmanager loki grafana 2>&1 | tail -5 || true

for svc in "${MONITORING_SERVICES[@]}"; do
  info "Starting ${svc}…"
  hg_docker compose \
    -f "${COMPOSE_FILE}" \
    -p "${PROJECT_NAME}" \
    up -d "${svc}" || warn "${svc} not found in compose — skipping."
done

wait_for_prometheus

info "Monitoring stack deployed."
info "  Prometheus  : http://localhost:9090"
info "  Grafana     : http://localhost:3000  (set GRAFANA_PASSWORD to change default)"
info "  Loki        : http://localhost:3100"
info "  Alertmanager: http://localhost:9093"
