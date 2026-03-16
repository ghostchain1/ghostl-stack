#!/usr/bin/env bash
# deploy-services.sh — Deploy GhostStack sovereign, economic, and AI services
#
# Boot order:
#   1. Postgres + Redis              (docker-compose.yml)
#   2. Sovereign economic services   (docker-compose.sovereign.yml)
#   3. GhostBrain AI stack           (docker-compose.ghostbrain.yml)
#   4. Supervisor / GAIS             (docker-compose.supervisor.yml)
#
# All services communicate internally — no external chain calls are made.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-60}"

log() { echo "[deploy-services] $*"; }
warn() { log "WARNING: $*"; }
die()  { log "ERROR: $*" >&2; exit 1; }

# ── Helper: wait for an HTTP health endpoint ──────────────────────────────────

wait_for_http() {
  local label="$1"
  local url="$2"
  local timeout="${3:-$WAIT_TIMEOUT}"

  log "Waiting for ${label} at ${url}..."
  local deadline=$(( $(date +%s) + timeout ))
  while true; do
    if [[ $(date +%s) -gt $deadline ]]; then
      warn "${label} did not become ready within ${timeout}s — continuing"
      return 1
    fi
    if curl -sf --max-time 5 "$url" -o /dev/null 2>/dev/null; then
      log "  ${label}: OK"
      return 0
    fi
    sleep 3
  done
}

# ── Helper: start a compose stack idempotently ───────────────────────────────

compose_up() {
  local label="$1"
  local compose_file="$2"
  shift 2
  local services=("$@")

  if [[ ! -f "$compose_file" ]]; then
    warn "Compose file not found: $compose_file — skipping ${label}"
    return 0
  fi

  log "Starting ${label}..."
  if [[ "${#services[@]}" -gt 0 ]]; then
    docker compose -f "$compose_file" up -d "${services[@]}"
  else
    docker compose -f "$compose_file" up -d
  fi
}

# ── 1. Infrastructure: Postgres + Redis + compliance ─────────────────────────

compose_up "Postgres + Redis + compliance" \
  "${STACK_DIR}/docker-compose.yml" \
  postgres redis

log "Waiting for Postgres on 5432..."
DEADLINE=$(( $(date +%s) + WAIT_TIMEOUT ))
while ! docker compose -f "${STACK_DIR}/docker-compose.yml" exec -T postgres \
    pg_isready -U "${POSTGRES_USER:-ghost}" -q 2>/dev/null; do
  if [[ $(date +%s) -gt $DEADLINE ]]; then
    warn "Postgres not ready after ${WAIT_TIMEOUT}s — continuing"
    break
  fi
  sleep 3
done
log "  Postgres: ready"

# Run migrations after DB is ready
if docker compose -f "${STACK_DIR}/docker-compose.yml" config --services 2>/dev/null | grep -q "^migrate$"; then
  log "Running database migrations..."
  docker compose -f "${STACK_DIR}/docker-compose.yml" run --rm migrate || \
    warn "Migration step failed — check logs"
fi

# Start compliance services
compose_up "Compliance services" \
  "${STACK_DIR}/docker-compose.yml" \
  ghost-compliance ghost-compliance-worker

wait_for_http "Compliance API" "http://localhost:${COMPLIANCE_PORT:-8090}/health" 60 || true

# ── 2. Sovereign economic services ────────────────────────────────────────────

compose_up "Sovereign economic services" \
  "${STACK_DIR}/docker-compose.sovereign.yml"

# Wait for each sovereign service (non-blocking — they may not have /health)
for svc_url in \
  "http://localhost:${L3_FEE_COLLECTOR_PORT:-7681}/health" \
  "http://localhost:${L2_REVENUE_AGGREGATOR_PORT:-7682}/health" \
  "http://localhost:${TREASURY_ENGINE_PORT:-7683}/health" \
  "http://localhost:${REWARD_DISTRIBUTOR_PORT:-7684}/health" \
  "http://localhost:${HYPER_GHOST_GOVERNOR_PORT:-7685}/health"; do
  wait_for_http "$(basename "$svc_url" /health)" "$svc_url" 90 || true
done

# ── 3. GhostBrain AI stack ────────────────────────────────────────────────────

compose_up "GhostBrain AI stack" "${STACK_DIR}/docker-compose.ghostbrain.yml"

# Core AI services — wait in dependency order
wait_for_http "GhostBrain Core"        "http://localhost:${GHOSTBRAIN_CORE_PORT:-7900}/health"       120 || true
wait_for_http "GhostBrain Orchestrator" "http://localhost:7895/health"                                90 || true
wait_for_http "Hypervisor Supervisor"  "http://localhost:${HYPER_GHOST_PORT:-7741}/health"           90 || true
wait_for_http "GSA"                    "http://localhost:${GSA_PORT:-7850}/health"                   60 || true
wait_for_http "GAIS REST API"          "http://localhost:${GAIS_LISTEN_PORT:-9100}/health"           60 || true

# ── 4. Supervisor stack ───────────────────────────────────────────────────────

if [[ -f "${STACK_DIR}/docker-compose.supervisor.yml" ]]; then
  compose_up "Infrastructure Supervisor" "${STACK_DIR}/docker-compose.supervisor.yml"
fi

# ── 5. Optional stacks (non-fatal if compose file absent) ────────────────────

OPTIONAL_STACKS=(
  "Autonomy:${STACK_DIR}/docker-compose.autonomy.yml"
  "AI Consensus:${STACK_DIR}/docker-compose.ai-consensus.yml"
  "Cascading Finality:${STACK_DIR}/docker-compose.cascading-finality.yml"
)

for entry in "${OPTIONAL_STACKS[@]}"; do
  IFS=: read -r label file <<< "$entry"
  if [[ -f "$file" ]]; then
    compose_up "$label" "$file"
  else
    log "Optional stack '$label' not found — skipping"
  fi
done

log "All GhostStack services deployed."
