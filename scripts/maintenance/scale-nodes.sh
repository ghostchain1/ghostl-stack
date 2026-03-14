#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack Auto-Scaler
#   Evaluates system load and scales Docker Compose services up or down.
#   Called by ai-supervisor.sh on every maintenance cycle.
#
#   Scaling decisions:
#     · Load avg (1min) > HIGH_THRESHOLD  → scale RPC replicas up
#     · Load avg (1min) < LOW_THRESHOLD   → scale RPC replicas down
#     · Memory < MEM_LOW_MB               → warn GVF + attempt scale-down
#     · Validator count < MIN_VALIDATORS  → re-launch validator stack
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GHOST_HOME="/home/${SUDO_USER:-${USER:-ghost}}"
STACK_DIR="${GHOST_HOME}/ghostl-stack"
COMPOSE_DIR="${STACK_DIR}/infrastructure/docker"
SCALE_LOG="${STACK_DIR}/logs/scale-nodes.log"
GVF_URL="http://localhost:9700"

mkdir -p "$(dirname "$SCALE_LOG")"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] [scaler] $*" | tee -a "$SCALE_LOG"; }

# ── thresholds ────────────────────────────────────────────────────────────
CPU_COUNT=$(nproc)
HIGH_THRESHOLD=$(echo "$CPU_COUNT * 0.80" | bc -l)   # 80 % of logical CPUs
LOW_THRESHOLD=$(echo  "$CPU_COUNT * 0.30" | bc -l)   # 30 % of logical CPUs
MEM_LOW_MB=1024
MIN_VALIDATORS=1
MAX_RPC_REPLICAS=4
MIN_RPC_REPLICAS=1

# ── current metrics ───────────────────────────────────────────────────────
LOAD_1MIN=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0")
MEM_FREE_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo "9999")

log "load_1min=${LOAD_1MIN} high_thr=${HIGH_THRESHOLD} low_thr=${LOW_THRESHOLD} mem_free=${MEM_FREE_MB}MB"

# ── current RPC replica count (containers named *-rpc-*) ──────────────────
CURRENT_RPC=$(docker ps --filter "name=ghostvalidator-rpc" -q 2>/dev/null | wc -l || echo "1")
log "current rpc replicas=${CURRENT_RPC}"

# ── scaling logic ─────────────────────────────────────────────────────────
SCALE_ACTION="none"

if (( $(echo "$LOAD_1MIN > $HIGH_THRESHOLD" | bc -l) )); then
    NEW_REPLICAS=$(( CURRENT_RPC + 1 ))
    [[ $NEW_REPLICAS -gt $MAX_RPC_REPLICAS ]] && NEW_REPLICAS=$MAX_RPC_REPLICAS

    if [[ $NEW_REPLICAS -gt $CURRENT_RPC ]]; then
        log "HIGH LOAD (${LOAD_1MIN}) — scaling RPC nodes: ${CURRENT_RPC} → ${NEW_REPLICAS}"
        docker compose \
            -f "${COMPOSE_DIR}/validator-stack.yml" \
            --env-file "${STACK_DIR}/.env" \
            up -d --scale "ghostvalidator-rpc=${NEW_REPLICAS}" >> "$SCALE_LOG" 2>&1 \
            && { log "OK: scaled up to ${NEW_REPLICAS} RPC replicas"; SCALE_ACTION="scale_up"; } \
            || log "WARN: scale-up failed"
    else
        log "Already at max replicas (${MAX_RPC_REPLICAS})"
    fi

elif (( $(echo "$LOAD_1MIN < $LOW_THRESHOLD" | bc -l) )); then
    NEW_REPLICAS=$(( CURRENT_RPC - 1 ))
    [[ $NEW_REPLICAS -lt $MIN_RPC_REPLICAS ]] && NEW_REPLICAS=$MIN_RPC_REPLICAS

    if [[ $NEW_REPLICAS -lt $CURRENT_RPC ]]; then
        log "LOW LOAD (${LOAD_1MIN}) — scaling RPC nodes: ${CURRENT_RPC} → ${NEW_REPLICAS}"
        docker compose \
            -f "${COMPOSE_DIR}/validator-stack.yml" \
            --env-file "${STACK_DIR}/.env" \
            up -d --scale "ghostvalidator-rpc=${NEW_REPLICAS}" >> "$SCALE_LOG" 2>&1 \
            && { log "OK: scaled down to ${NEW_REPLICAS} RPC replicas"; SCALE_ACTION="scale_down"; } \
            || log "WARN: scale-down failed"
    fi
else
    log "Load nominal — no scaling needed"
fi

# ── memory pressure warning ───────────────────────────────────────────────
if [[ $MEM_FREE_MB -lt $MEM_LOW_MB ]]; then
    log "WARN: low memory (${MEM_FREE_MB} MB free) — notifying GVF"
    curl -sf -X POST "${GVF_URL}/events" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg ts "$(ts)" \
            --argjson mem "$MEM_FREE_MB" \
            '{event:"low_memory",mem_free_mb:$mem,timestamp:$ts}')" \
        >> "$SCALE_LOG" 2>&1 || true
fi

# ── validator liveness ────────────────────────────────────────────────────
ACTIVE_VALIDATORS=$(docker ps --filter "name=ghostvalidator" -q 2>/dev/null | wc -l || echo "0")
if [[ $ACTIVE_VALIDATORS -lt $MIN_VALIDATORS ]]; then
    log "WARN: only ${ACTIVE_VALIDATORS} validator(s) running (min=${MIN_VALIDATORS}) — relaunching"
    docker compose \
        -f "${COMPOSE_DIR}/validator-stack.yml" \
        --env-file "${STACK_DIR}/.env" \
        up -d >> "$SCALE_LOG" 2>&1 \
        && log "OK: validator-stack relaunched" \
        || log "FAIL: validator relaunch failed"
fi

# ── notify GVF of scaling event ───────────────────────────────────────────
if [[ "$SCALE_ACTION" != "none" ]]; then
    curl -sf -X POST "${GVF_URL}/events" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg ts "$(ts)" \
            --arg action "$SCALE_ACTION" \
            --argjson before "$CURRENT_RPC" \
            --argjson after "${NEW_REPLICAS:-$CURRENT_RPC}" \
            '{event:"scaling",action:$action,before:$before,after:$after,timestamp:$ts}')" \
        >> "$SCALE_LOG" 2>&1 || true
fi

log "scale-nodes complete (action=${SCALE_ACTION})"
