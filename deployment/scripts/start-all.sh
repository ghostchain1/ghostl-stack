#!/usr/bin/env bash
# ============================================================
# GhostStack MDB — start-all.sh
# Brings up every GhostStack layer in correct dependency order
#
# Startup sequence:
#   1. Docker networks
#   2. Data Mesh (Redis · Postgres · Elasticsearch)
#   3. GhostBrain Core
#   4. Chain Validators
#   5. Monitoring (Prometheus · Grafana · Loki)
#   6. AI Engine Cluster (9970–9985)
#   7. Control Center (Next.js · port 3000)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MDB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STACK_ROOT="$(cd "${MDB_DIR}/.." && pwd)"
DOCKER_DIR="${STACK_ROOT}/infrastructure/docker"

# ── Load env if not already set ──────────────────────────────
if [[ -f "${MDB_DIR}/configs/ghoststack.env" ]]; then
  set -a; source "${MDB_DIR}/configs/ghoststack.env"; set +a
fi
if [[ -f "${MDB_DIR}/configs/ghoststack.local.env" ]]; then
  set -a; source "${MDB_DIR}/configs/ghoststack.local.env"; set +a
fi

# ── Parse forwarded arguments from deploy.sh ─────────────────
SKIP_BUILD=false
ONLY_LAYER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)  shift; SKIP_BUILD="$1" ;;
    --only-layer)  shift; ONLY_LAYER="$1" ;;
  esac
  shift
done

# ── Helpers ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()     { echo -e "${GREEN}[✓]${RESET} $*"; }
info()   { echo -e "${CYAN}[→]${RESET} $*"; }
warn()   { echo -e "${YELLOW}[!]${RESET} $*"; }
section(){ echo; echo -e "${BOLD}${CYAN}── $* ──────────────────────────────────────────${RESET}"; }

compose_up() {
  local file="$1"
  local label="$2"
  local extra_flags=""
  [[ "${SKIP_BUILD}" == true ]] && extra_flags="--no-build"
  info "Starting ${label}…"
  docker compose --env-file "${MDB_DIR}/configs/ghoststack.env" \
    -f "${file}" up -d ${extra_flags}
  ok "${label} up"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local wait="${3:-30}"
  info "Waiting for ${label} at ${url} (up to ${wait}s)…"
  local elapsed=0
  until curl -fsS --max-time 3 "${url}" &>/dev/null; do
    sleep 2; elapsed=$((elapsed+2))
    if [[ ${elapsed} -ge ${wait} ]]; then
      warn "${label} did not respond within ${wait}s — continuing anyway"
      return 0
    fi
  done
  ok "${label} is healthy"
}

wait_for_tcp() {
  local host="$1"
  local port="$2"
  local label="$3"
  local wait="${4:-30}"
  info "Waiting for ${label} on ${host}:${port}…"
  local elapsed=0
  until (echo >/dev/tcp/"${host}"/"${port}") 2>/dev/null; do
    sleep 2; elapsed=$((elapsed+2))
    if [[ ${elapsed} -ge ${wait} ]]; then
      warn "${label} not reachable after ${wait}s — continuing"
      return 0
    fi
  done
  ok "${label} accepting connections"
}

run_only() {
  # Returns true if ONLY_LAYER is empty (run all) or matches $1
  [[ -z "${ONLY_LAYER}" || "${ONLY_LAYER}" == "$1" ]]
}

# ── 0. Ensure Docker networks exist ──────────────────────────
section "Layer 0 — Docker Networks"
for net in ghostbrain-net ghoststack-ai-net; do
  if ! docker network ls --format '{{.Name}}' | grep -q "^${net}$"; then
    info "Creating network: ${net}"
    case "${net}" in
      ghostbrain-net)     docker network create --driver bridge --subnet 172.28.0.0/16 "${net}" ;;
      ghoststack-ai-net)  docker network create --driver bridge --subnet 172.32.0.0/16 "${net}" ;;
    esac
    ok "Network ${net} created"
  else
    ok "Network ${net} already exists"
  fi
done

# ── 1. Data Mesh ─────────────────────────────────────────────
if run_only data-mesh; then
  section "Layer 1 — Data Mesh (Redis · Postgres · Elasticsearch)"
  compose_up "${DOCKER_DIR}/data-mesh-stack.yml" "Data Mesh"
  wait_for_tcp localhost "${REDIS_PORT:-6379}"    "Redis"    "${WAIT_DATA_MESH:-20}"
  wait_for_tcp localhost "${POSTGRES_PORT:-5432}" "Postgres" "${WAIT_DATA_MESH:-20}"
fi

# ── 2. GhostBrain Core ───────────────────────────────────────
if run_only ghostbrain; then
  section "Layer 2 — GhostBrain Core"
  compose_up "${DOCKER_DIR}/ghostbrain-stack.yml" "GhostBrain"
  wait_for_http "http://localhost:${GHOSTBRAIN_SWARM_PORT:-9000}/health" \
    "GhostBrain Swarm" "${WAIT_GHOSTBRAIN:-30}"
fi

# ── 3. Chain Validators ──────────────────────────────────────
if run_only validators; then
  section "Layer 3 — Chain Validators"
  compose_up "${DOCKER_DIR}/validator-stack.yml" "Validators"
  wait_for_tcp localhost 8545 "Validator RPC" "${WAIT_VALIDATORS:-20}"
fi

# ── 4. Monitoring ────────────────────────────────────────────
if run_only monitoring; then
  section "Layer 4 — Monitoring (Prometheus · Grafana · Loki)"
  compose_up "${DOCKER_DIR}/monitoring-stack.yml" "Monitoring"
  wait_for_http "http://localhost:${PROMETHEUS_PORT:-9090}/-/healthy" \
    "Prometheus" "${WAIT_MONITORING:-15}"
  wait_for_http "http://localhost:${GRAFANA_PORT:-3001}/api/health" \
    "Grafana" "${WAIT_MONITORING:-15}"
fi

# ── 5. AI Engine Cluster ─────────────────────────────────────
if run_only ai-engines; then
  section "Layer 5 — AI Engine Cluster (9970–9985)"
  compose_up "${DOCKER_DIR}/ai-marketing-stack.yml" "AI Engines"
  wait_for_http "http://localhost:${AIMS_PORT:-9970}/health" \
    "AIMS (ai-marketing)" "${WAIT_AI_ENGINES:-30}"
  wait_for_http "http://localhost:${INE_PORT:-9985}/health" \
    "INE (ai-interplanetary)" "${WAIT_AI_ENGINES:-30}"
fi

# ── 6. Control Center (Next.js web) ──────────────────────────
if run_only web; then
  section "Layer 6 — Control Center (Next.js · port ${CONTROL_CENTER_PORT:-3000})"
  WEB_DIR="${STACK_ROOT}/apps/web"
  if [[ -d "${WEB_DIR}" ]]; then
    if [[ "${SKIP_BUILD}" != true ]]; then
      info "Building control center…"
      (cd "${WEB_DIR}" && npm run build) && ok "Build complete"
    fi
    info "Starting control center on port ${CONTROL_CENTER_PORT:-3000}…"
    (cd "${WEB_DIR}" && PORT="${CONTROL_CENTER_PORT:-3000}" npm run start &)
    wait_for_http "http://localhost:${CONTROL_CENTER_PORT:-3000}" \
      "Control Center" 30
  else
    warn "apps/web not found — skipping control center"
  fi
fi

# ── Summary ──────────────────────────────────────────────────
echo
echo -e "${BOLD}${GREEN}All requested layers started.${RESET}"
echo "  Grafana:         http://localhost:${GRAFANA_PORT:-3001}"
echo "  Prometheus:      http://localhost:${PROMETHEUS_PORT:-9090}"
echo "  Control Center:  http://localhost:${CONTROL_CENTER_PORT:-3000}"
echo "  GhostBrain:      http://localhost:${GHOSTBRAIN_SWARM_PORT:-9000}"
echo "  AI Engines:      ports ${AIMS_PORT:-9970}–${INE_PORT:-9985}"
echo
