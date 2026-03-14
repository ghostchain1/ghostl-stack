#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack Health Monitor
#   Detects and automatically repairs failed/unhealthy containers.
#   Designed to run every 30s via ghoststack-health-monitor.timer.
#
#   Exit codes:
#       0   all healthy (or repaired successfully)
#       1   one or more services remain unhealthy after repair attempts
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GHOST_HOME="/home/${SUDO_USER:-${USER:-ghost}}"
STACK_DIR="${GHOST_HOME}/ghostl-stack"
COMPOSE_DIR="${STACK_DIR}/infrastructure/docker"
LOG_FILE="${STACK_DIR}/logs/health-monitor.log"
SCP_URL="http://localhost:9500"
GVF_URL="http://localhost:9700"

mkdir -p "$(dirname "$LOG_FILE")"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

REPAIRED=0; FAILED=0

# ─────────────────────────────────────────────────────────────────────────────
# 1. Restart exited containers
# ─────────────────────────────────────────────────────────────────────────────

EXITED=$(docker ps --filter "status=exited" --filter "label=com.ghost.stack" -q 2>/dev/null || true)
if [[ -n "$EXITED" ]]; then
    for cid in $EXITED; do
        name=$(docker inspect --format='{{.Name}}' "$cid" 2>/dev/null | tr -d '/')
        log "REPAIR: restarting exited container: ${name} (${cid})"
        docker restart "$cid" >> "$LOG_FILE" 2>&1 && { log "OK: ${name} restarted"; ((REPAIRED++)) || true; } \
            || { log "FAIL: could not restart ${name}"; ((FAILED++)) || true; }
    done
else
    log "INFO: no exited containers"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Check Docker health-check status
# ─────────────────────────────────────────────────────────────────────────────

UNHEALTHY=$(docker ps --filter "health=unhealthy" -q 2>/dev/null || true)
if [[ -n "$UNHEALTHY" ]]; then
    for cid in $UNHEALTHY; do
        name=$(docker inspect --format='{{.Name}}' "$cid" 2>/dev/null | tr -d '/')
        log "REPAIR: unhealthy container: ${name} — restarting"
        docker restart "$cid" >> "$LOG_FILE" 2>&1 && { log "OK: ${name} restarted"; ((REPAIRED++)) || true; } \
            || { log "FAIL: could not restart ${name}"; ((FAILED++)) || true; }
    done
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Check critical GhostBrain HTTP endpoints
# ─────────────────────────────────────────────────────────────────────────────

declare -A CRITICAL_SERVICES=(
    ["ghostbrain-swarm"]="http://localhost:9000/health"
    ["ghostbrain-kernel"]="http://localhost:9300/health"
    ["ghostbrain-control-plane"]="http://localhost:9500/health"
    ["ghostbrain-data-mesh"]="http://localhost:9900/health"
)

for svc in "${!CRITICAL_SERVICES[@]}"; do
    url="${CRITICAL_SERVICES[$svc]}"
    code=$(curl -sf --max-time 4 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$code" != "200" ]]; then
        log "REPAIR: ${svc} not responding (HTTP ${code}) — restarting container"
        docker restart "$svc" >> "$LOG_FILE" 2>&1 \
            && { log "OK: ${svc} restarted"; ((REPAIRED++)) || true; } \
            || { log "FAIL: ${svc} restart failed"; ((FAILED++)) || true; }
    else
        log "OK: ${svc}"
    fi
done

# ─────────────────────────────────────────────────────────────────────────────
# 4. Check validator containers — re-launch stack if all are gone
# ─────────────────────────────────────────────────────────────────────────────

VALIDATOR_COUNT=$(docker ps --filter "name=ghostvalidator" -q 2>/dev/null | wc -l || echo "0")
if [[ $VALIDATOR_COUNT -eq 0 ]]; then
    log "REPAIR: no validator containers running — re-launching validator-stack"
    docker compose \
        -f "${COMPOSE_DIR}/validator-stack.yml" \
        --env-file "${STACK_DIR}/.env" \
        up -d >> "$LOG_FILE" 2>&1 \
        && { log "OK: validator-stack re-launched"; ((REPAIRED++)) || true; } \
        || { log "FAIL: validator-stack re-launch failed"; ((FAILED++)) || true; }
else
    log "OK: ${VALIDATOR_COUNT} validator container(s) running"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Check data-mesh containers (Redis, Postgres)
# ─────────────────────────────────────────────────────────────────────────────

if ! docker exec ghostmesh-redis redis-cli ping > /dev/null 2>&1; then
    log "REPAIR: Redis not responding — restarting ghostmesh-redis"
    docker restart ghostmesh-redis >> "$LOG_FILE" 2>&1 \
        && { log "OK: Redis restarted"; ((REPAIRED++)) || true; } \
        || { log "FAIL: Redis restart failed"; ((FAILED++)) || true; }
fi

if ! docker exec ghostmesh-postgres pg_isready -U ghost -d ghoststack > /dev/null 2>&1; then
    log "REPAIR: PostgreSQL not ready — restarting ghostmesh-postgres"
    docker restart ghostmesh-postgres >> "$LOG_FILE" 2>&1 \
        && { log "OK: PostgreSQL restarted"; ((REPAIRED++)) || true; } \
        || { log "FAIL: PostgreSQL restart failed"; ((FAILED++)) || true; }
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Report repair events to GhostBrain Validator Fabric (GVF)
# ─────────────────────────────────────────────────────────────────────────────

if [[ $REPAIRED -gt 0 ]]; then
    PAYLOAD=$(jq -n \
        --argjson repaired "$REPAIRED" \
        --argjson failed "$FAILED" \
        --arg ts "$(ts)" \
        '{event:"health_repair",repaired:$repaired,failed:$failed,timestamp:$ts}')
    curl -sf -X POST "${GVF_URL}/events" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" >> "$LOG_FILE" 2>&1 || true
    log "REPORT: ${REPAIRED} repaired, ${FAILED} failed → GVF notified"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. Summary log
# ─────────────────────────────────────────────────────────────────────────────

log "DONE: repaired=${REPAIRED} failed=${FAILED}"
[[ $FAILED -eq 0 ]]
