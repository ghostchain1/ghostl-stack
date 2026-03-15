#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack AI Infrastructure Supervisor
#   Persistent daemon that runs the full maintenance loop.
#   Managed by ghoststack-supervisor.service (PID 1 in the unit).
#
#   Loop every 30 seconds:
#       1. Container health check + auto-repair
#       2. Auto-scaling decision
#       3. Telemetry push to SCP + GVF
#       4. Log pruning (keep logs < 100 MB)
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GHOST_HOME="/home/${SUDO_USER:-${USER:-ghost}}"
STACK_DIR="${GHOST_HOME}/ghostl-stack"
SCRIPTS_DIR="${STACK_DIR}/scripts/maintenance"
LOG_DIR="${STACK_DIR}/logs"
SUPERVISOR_LOG="${LOG_DIR}/supervisor.log"
SCP_URL="http://localhost:9500"
GVF_URL="http://localhost:9700"
LOOP_INTERVAL=30
MAX_LOG_MB=100

mkdir -p "$LOG_DIR"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] [supervisor] $*" | tee -a "$SUPERVISOR_LOG"; }

# ── trap for clean shutdown ────────────────────────────────────────────────
shutdown_handler() {
    log "SIGTERM received — supervisor shutting down cleanly"
    exit 0
}
trap shutdown_handler SIGTERM SIGINT

log "GhostStack AI Supervisor starting (PID $$, loop=${LOOP_INTERVAL}s)"

CYCLE=0

while true; do
    ((CYCLE++)) || true
    log "── Cycle ${CYCLE} ─────────────────────────────────────"

    # ── 1. Health monitor ─────────────────────────────────────────────────
    if [[ -x "${SCRIPTS_DIR}/health-monitor.sh" ]]; then
        bash "${SCRIPTS_DIR}/health-monitor.sh" >> "$SUPERVISOR_LOG" 2>&1 \
            && log "health-monitor: OK" \
            || log "health-monitor: WARNING (see health-monitor.log)"
    fi

    # ── 2. Auto-scaling ───────────────────────────────────────────────────
    if [[ -x "${SCRIPTS_DIR}/scale-nodes.sh" ]]; then
        bash "${SCRIPTS_DIR}/scale-nodes.sh" >> "$SUPERVISOR_LOG" 2>&1 \
            && log "scale-nodes: evaluated" \
            || log "scale-nodes: WARNING"
    fi

    # ── 3. Telemetry push to SCP ──────────────────────────────────────────
    CONTAINER_COUNT=$(docker ps -q 2>/dev/null | wc -l || echo "0")
    CPU_1MIN=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0")
    MEM_FREE_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo "0")
    DISK_FREE_GB=$(df -BG "${STACK_DIR}" 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4);print $4}' || echo "0")

    TELEMETRY=$(jq -n \
        --arg ts "$(ts)" \
        --argjson cycle "$CYCLE" \
        --argjson containers "$CONTAINER_COUNT" \
        --arg cpu_1min "$CPU_1MIN" \
        --argjson mem_free_mb "$MEM_FREE_MB" \
        --argjson disk_free_gb "$DISK_FREE_GB" \
        '{
            source:        "ghoststack-supervisor",
            timestamp:     $ts,
            cycle:         $cycle,
            containers:    $containers,
            cpu_load_1m:   ($cpu_1min | tonumber),
            mem_free_mb:   $mem_free_mb,
            disk_free_gb:  $disk_free_gb
        }')

    curl -sf -X POST "${SCP_URL}/telemetry" \
        -H "Content-Type: application/json" \
        -d "$TELEMETRY" >> "$SUPERVISOR_LOG" 2>&1 \
        && log "telemetry → SCP: OK" \
        || log "telemetry → SCP: unreachable (will retry next cycle)"

    # Also notify GVF (Validator Fabric) with infrastructure state
    curl -sf -X POST "${GVF_URL}/infra-state" \
        -H "Content-Type: application/json" \
        -d "$TELEMETRY" >> "$SUPERVISOR_LOG" 2>&1 || true

    # ── 4. Log pruning ────────────────────────────────────────────────────
    LOG_SIZE_MB=$(du -sm "$LOG_DIR" 2>/dev/null | awk '{print $1}' || echo "0")
    if [[ $LOG_SIZE_MB -gt $MAX_LOG_MB ]]; then
        log "Log directory is ${LOG_SIZE_MB} MB — pruning old logs"
        find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
        find "$LOG_DIR" -name "*.log.gz" -mtime +14 -delete 2>/dev/null || true
        log "Log pruning complete"
    fi

    # ── sleep until next cycle ────────────────────────────────────────────
    sleep "$LOOP_INTERVAL"
done
