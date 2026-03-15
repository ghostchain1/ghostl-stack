#!/usr/bin/env bash
# repair-validator.sh — Auto-repair a stopped or unhealthy validator
# Usage: ./repair-validator.sh <validator-id>
#
# Called by GhostBrain Validator Fabric AI when it detects a down validator.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[repair]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

VALIDATOR_ID="${1:-}"
GVF_URL="${GHOSTBRAIN_GVF_URL:-http://localhost:9700}"

[[ -z "$VALIDATOR_ID" ]] && die "Usage: $0 <validator-id>"

log "Repairing validator: ${VALIDATOR_ID}"

# ── Get current state ────────────────────────────────────────────
STATE=$(docker inspect --format='{{.State.Status}}' "${VALIDATOR_ID}" 2>/dev/null || echo "missing")
log "Current state: ${STATE}"

notify_gvf() {
    curl -sf -X POST "${GVF_URL}/validators/events" \
        -H "Content-Type: application/json" \
        -d "{\"event\":\"$1\",\"validatorId\":\"${VALIDATOR_ID}\",\"prevState\":\"${STATE}\"}" \
        >/dev/null 2>&1 || warn "GVF notification failed (non-critical)"
}

notify_gvf "REPAIR_STARTED"

case "$STATE" in
    running)
        warn "Validator is running — checking responsiveness..."
        if ! docker exec "${VALIDATOR_ID}" wget -qO- http://localhost:8545 >/dev/null 2>&1; then
            warn "RPC unresponsive — performing restart..."
            docker restart "${VALIDATOR_ID}"
            ok "Restarted"
        else
            ok "Validator is healthy — no action needed"
            exit 0
        fi
        ;;
    exited|dead)
        log "Starting stopped validator..."
        docker start "${VALIDATOR_ID}"
        ok "Started"
        ;;
    paused)
        log "Unpausing validator..."
        docker unpause "${VALIDATOR_ID}"
        ok "Unpaused"
        ;;
    missing)
        die "Container '${VALIDATOR_ID}' not found — run deploy-validator.sh first"
        ;;
    *)
        warn "Unknown state '${STATE}' — attempting restart..."
        docker restart "${VALIDATOR_ID}" || die "Restart failed"
        ok "Restarted"
        ;;
esac

# ── Verify recovery ──────────────────────────────────────────────
sleep 5
NEW_STATE=$(docker inspect --format='{{.State.Status}}' "${VALIDATOR_ID}" 2>/dev/null || echo "missing")
log "Post-repair state: ${NEW_STATE}"

if [[ "$NEW_STATE" == "running" ]]; then
    ok "Validator '${VALIDATOR_ID}' repaired successfully"
    notify_gvf "REPAIR_COMPLETED"
else
    die "Repair failed — validator still in state: ${NEW_STATE}"
fi
