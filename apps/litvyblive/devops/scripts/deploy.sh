#!/usr/bin/env bash
# LitVybzLive — Full Platform Deploy
# Usage: bash devops/scripts/deploy.sh [dev|staging|prod]
#
# Orchestrates one-command deployment of all 24+ services.
# Run from repo root: bash apps/litvyblive/devops/scripts/deploy.sh [env]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVOPS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEVOPS_DIR}/compose/docker-compose.full.yml"
ENV="${1:-dev}"
ENV_FILE="${DEVOPS_DIR}/.env.${ENV}"
LOG_FILE="${DEVOPS_DIR}/deploy.log"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*" | tee -a "${LOG_FILE}"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*" | tee -a "${LOG_FILE}"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "${LOG_FILE}"; }
die()   { echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_FILE}"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
info "LitVybzLive deploy — environment: ${ENV}"
echo "================================================" | tee -a "${LOG_FILE}"
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') START deploy [${ENV}]" | tee -a "${LOG_FILE}"

command -v docker &>/dev/null  || die "docker not found"
command -v docker compose &>/dev/null 2>&1 || \
  docker compose version &>/dev/null 2>&1 || die "docker compose not found"

[[ -f "${COMPOSE_FILE}" ]] || die "Compose file not found: ${COMPOSE_FILE}"

# Load env file if it exists
if [[ -f "${ENV_FILE}" ]]; then
  info "Loading env from ${ENV_FILE}"
  set -a; source "${ENV_FILE}"; set +a
elif [[ -f "${DEVOPS_DIR}/.env" ]]; then
  warn "No .env.${ENV} found — falling back to .env"
  set -a; source "${DEVOPS_DIR}/.env"; set +a
else
  warn "No .env file found — relying entirely on shell environment"
fi

# ── Required variable validation ─────────────────────────────────────────────
REQUIRED_VARS=(
  LITVYB_JWT_SECRET
  POSTGRES_PASSWORD
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  [[ -z "${!var:-}" ]] && MISSING+=("${var}")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "Missing required env vars: ${MISSING[*]}"
fi

# Warn on defaults that should be changed in prod
if [[ "${ENV}" == "prod" ]]; then
  [[ "${LITVYB_JWT_SECRET}" == "litvyblive-dev-secret" ]] && \
    die "LITVYB_JWT_SECRET must not be the default value in production"
fi

# ── Build images ──────────────────────────────────────────────────────────────
info "Building Docker images …"
docker compose -f "${COMPOSE_FILE}" build --parallel 2>&1 | tee -a "${LOG_FILE}"
ok "Build complete"

# ── Pull external images ──────────────────────────────────────────────────────
info "Pulling external images (redis, postgres, prometheus, grafana) …"
docker compose -f "${COMPOSE_FILE}" pull redis postgres prometheus grafana node-exporter \
  2>&1 | tee -a "${LOG_FILE}"

# ── Start infrastructure first ────────────────────────────────────────────────
info "Starting infrastructure services (redis, postgres) …"
docker compose -f "${COMPOSE_FILE}" up -d redis postgres
info "Waiting for Redis to be healthy …"
_wait_healthy() {
  local svc="$1"; local max=30; local i=0
  while [[ $i -lt $max ]]; do
    status=$(docker compose -f "${COMPOSE_FILE}" ps --format json "${svc}" 2>/dev/null \
             | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
    [[ "${status}" == "healthy" ]] && { ok "${svc} is healthy"; return 0; }
    i=$((i+1)); sleep 2
    echo -n "."
  done
  echo ""
  die "${svc} did not become healthy within $((max*2))s"
}
_wait_healthy redis
_wait_healthy postgres

# ── Start streaming infrastructure ───────────────────────────────────────────
info "Starting streaming services …"
docker compose -f "${COMPOSE_FILE}" up -d \
  mediasoup-server webrtc-gateway stream-controller \
  edge-node-us-east edge-node-eu-west edge-node-asia \
  ffmpeg-transcoder redis-bus
sleep 5

# ── Start all backend services ────────────────────────────────────────────────
info "Starting backend microservices …"
docker compose -f "${COMPOSE_FILE}" up -d \
  api-gateway auth-service user-service stream-service chat-service \
  gift-service wallet-service agency-service matchmaking-service \
  games-service ranking-service event-service launchpad-service \
  treasury-service marketing-service fraud-service analytics-service \
  notification-service

# ── Start monitoring stack ────────────────────────────────────────────────────
info "Starting monitoring stack …"
docker compose -f "${COMPOSE_FILE}" up -d prometheus grafana node-exporter

# ── Health check loop ─────────────────────────────────────────────────────────
info "Running post-deploy health checks …"
declare -a CHECK_URLS=(
  "http://localhost:7001/health|api-gateway"
  "http://localhost:7010/health|auth-service"
  "http://localhost:7012/health|stream-service"
  "http://localhost:3000/health|mediasoup-server"
  "http://localhost:3001/health|webrtc-gateway"
  "http://localhost:9090/-/healthy|prometheus"
)
FAIL=0
for entry in "${CHECK_URLS[@]}"; do
  url="${entry%%|*}"; name="${entry##*|}"
  for attempt in 1 2 3 4 5; do
    if curl -sf --max-time 5 "${url}" >/dev/null 2>&1; then
      ok "${name}: UP"
      break
    fi
    [[ $attempt -lt 5 ]] && { sleep 3; continue; }
    warn "${name}: did not respond after 5 attempts (${url})"
    FAIL=$((FAIL+1))
  done
done

echo ""
echo "================================================" | tee -a "${LOG_FILE}"
if [[ $FAIL -eq 0 ]]; then
  ok "Deploy complete. All services healthy."
  info "  API Gateway  → http://localhost:7001"
  info "  WebRTC GW    → http://localhost:3001"
  info "  Prometheus   → http://localhost:9090"
  info "  Grafana      → http://localhost:3100"
else
  warn "Deploy finished with ${FAIL} unhealthy service(s). Check 'docker compose ps' for details."
  exit 1
fi
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') END deploy [${ENV}]" | tee -a "${LOG_FILE}"
