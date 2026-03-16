#!/usr/bin/env bash
# deploy-apps.sh — Deploy GhostStack applications, gateway, and frontend
#
# Deploys:
#   - apps/api  (Express BFF — port 4000)
#   - apps/web  (Next.js UI — port 3200)
#   - NOC AI Portal (docker-compose.portal.yml — port 7960)
#   - GhostX exchange UI (docker-compose.ghostx.yml)
#   - GSE / GSI sub-stacks (optional)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-90}"

log() { echo "[deploy-apps] $*"; }
warn() { log "WARNING: $*"; }

# ── Helper: HTTP health wait ──────────────────────────────────────────────────

wait_for_http() {
  local label="$1"
  local url="$2"
  local timeout="${3:-$WAIT_TIMEOUT}"
  log "Waiting for ${label} at ${url}..."
  local deadline=$(( $(date +%s) + timeout ))
  while true; do
    if [[ $(date +%s) -gt $deadline ]]; then
      warn "${label} not ready after ${timeout}s — continuing"
      return 1
    fi
    if curl -sf --max-time 5 "$url" -o /dev/null 2>/dev/null; then
      log "  ${label}: OK"
      return 0
    fi
    sleep 4
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

# ── 1. Build application images if not already built ─────────────────────────

if [[ -f "${STACK_DIR}/apps/api/Dockerfile" ]]; then
  if [[ -z "$(docker images -q ghostchain-api 2>/dev/null)" ]]; then
    log "Building apps/api image..."
    docker build \
      -t ghostchain-api:latest \
      -f "${STACK_DIR}/apps/api/Dockerfile" \
      "${STACK_DIR}" \
      --build-arg NODE_ENV=production \
      --quiet
  else
    log "apps/api image already built — skipping"
  fi
fi

if [[ -f "${STACK_DIR}/apps/web/Dockerfile" ]]; then
  if [[ -z "$(docker images -q ghostchain-web 2>/dev/null)" ]]; then
    log "Building apps/web image..."
    docker build \
      -t ghostchain-web:latest \
      -f "${STACK_DIR}/apps/web/Dockerfile" \
      "${STACK_DIR}" \
      --build-arg NODE_ENV=production \
      --quiet
  else
    log "apps/web image already built — skipping"
  fi
fi

# ── 2. Start dev/app compose (API + Web + gateway) ────────────────────────────

APPS_COMPOSE_FILES=(
  "${STACK_DIR}/apps/api-compose.yml"
  "${STACK_DIR}/apps/docker-compose.yml"
  "${STACK_DIR}/docker-compose.dev.yml"
)

APPS_COMPOSE=""
for f in "${APPS_COMPOSE_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    APPS_COMPOSE="$f"
    break
  fi
done

if [[ -n "$APPS_COMPOSE" ]]; then
  log "Starting apps stack from: $APPS_COMPOSE"
  docker compose -f "$APPS_COMPOSE" up -d
else
  warn "No apps compose file found — API and Web must be started separately"
fi

# ── 3. NOC AI Portal ─────────────────────────────────────────────────────────

compose_up "NOC AI Portal" "${STACK_DIR}/docker-compose.portal.yml"
wait_for_http "NOC AI Portal" "http://localhost:7960/health" 60 || true

# ── 4. GhostX Exchange ────────────────────────────────────────────────────────

compose_up "GhostXchange" "${STACK_DIR}/docker-compose.ghostx.yml"

# ── 5. LitVybzLive Economy Stack ──────────────────────────────────────────────

LITVYB_COMPOSE="${STACK_DIR}/apps/litvyblive/docker/docker-compose.yml"

if [[ -f "$LITVYB_COMPOSE" ]]; then
  if [[ -z "${ECONOMY_DB_PASSWORD:-}" ]]; then
    warn "ECONOMY_DB_PASSWORD is not set — skipping LitVybzLive economy stack"
  else
    log "Starting LitVybzLive economy infrastructure (Postgres + Redis)..."
    docker compose -f "$LITVYB_COMPOSE" up -d economy-postgres economy-redis

    # Wait for Postgres to be healthy before running migrations
    log "Waiting for economy-postgres to be ready..."
    local _pgdeadline=$(( $(date +%s) + 60 ))
    until docker compose -f "$LITVYB_COMPOSE" exec -T economy-postgres \
          pg_isready -U postgres -d litvyb_economy >/dev/null 2>&1; do
      if [[ $(date +%s) -gt $_pgdeadline ]]; then
        warn "economy-postgres did not become ready in 60s — skipping migrations"
        break
      fi
      sleep 3
    done

    # Apply schema migrations (idempotent — all CREATE IF NOT EXISTS)
    MIGRATION="${STACK_DIR}/apps/litvyblive/economy/migrations/001_init.sql"
    if [[ -f "$MIGRATION" ]]; then
      log "Applying economy schema migrations..."
      docker compose -f "$LITVYB_COMPOSE" exec -T economy-postgres \
        psql -U postgres -d litvyb_economy \
        < "$MIGRATION" \
        && log "  Migrations applied." \
        || warn "  Migration returned non-zero — check for errors above"
    fi

    log "Starting LitVybzLive economy services..."
    docker compose -f "$LITVYB_COMPOSE" up -d \
      creator-treasury fan-memberships creator-tokens nft-gifts \
      staking-engine revenue-distribution fan-dao marketplace
  fi
fi

# ── 6. Optional sub-stacks ────────────────────────────────────────────────────

OPTIONAL_STACKS=(
  "GhostSovereign Engine (GSE):${STACK_DIR}/docker-compose.gse.yml"
  "GhostSovereign Identity (GSI):${STACK_DIR}/docker-compose.gsi.yml"
  "GhostSovereign Assets (GSA):${STACK_DIR}/docker-compose.gsa.yml"
  "GhostSovereign Exchange (GSX):${STACK_DIR}/docker-compose.gsx.yml"
  "AI Agents:${STACK_DIR}/docker-compose.agents.yml"
  "Phase 3 features:${STACK_DIR}/docker-compose.phase3.yml"
)

for entry in "${OPTIONAL_STACKS[@]}"; do
  IFS=: read -r label file <<< "$entry"
  if [[ -f "$file" ]]; then
    compose_up "$label" "$file"
  fi
done

# ── 6. Health gates ───────────────────────────────────────────────────────────

wait_for_http "GhostStack API"  "http://localhost:${API_PORT:-4000}/health"  120
wait_for_http "GhostStack Web"  "http://localhost:${WEB_PORT:-3200}"         90 || true

log "Applications deployed."
