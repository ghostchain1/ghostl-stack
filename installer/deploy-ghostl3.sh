#!/usr/bin/env bash
# deploy-ghostl3.sh — Deploy GhostL3 custom execution services (chain_id=903)
#
# GhostL3 settles to GhostL2 — it NEVER talks to L1 directly.
# L2 MUST be healthy before this script runs.
#
# L2L3Bridge         : 0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
# L2 Rollup (L3)     : 0x130A46b6E41DB6E1e18fb9c759F223c459190e90
# Finality Oracle L3 : 0x87F850cbC2cFfac086F20d0d7307E12d06fA2127
# RPC port: 39545

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

L2_RPC_PORT="${L2_RPC_PORT:-29547}"
L3_RPC_PORT="${L3_RPC_PORT:-39545}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-180}"
COMPOSE_FILE="${STACK_DIR}/docker-compose.custom-rollup.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"
L3_SERVICES=(
  ghost-exec-l3
  ghost-sequencer-l3
  ghost-deriver-l3
  ghost-settlement-l3
  ghost-bridge-l3
  ghost-proof-l3
)

log() { echo "[deploy-ghostl3] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ── Verify L2 is still healthy before starting L3 ────────────────────────────

log "Verifying GhostL2 is healthy on port ${L2_RPC_PORT}..."
if ! curl -sf \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${L2_RPC_PORT}" \
    -o /dev/null 2>/dev/null; then
  die "L2 RPC is not responding on port ${L2_RPC_PORT}. Run deploy-ghostl2.sh first."
fi
log "L2 pre-check: OK"

wait_for_http() {
  local url="$1"
  local label="$2"
  local deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
  while true; do
    if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
      log "${label} healthy."
      return 0
    fi
    if [[ $(date +%s) -gt $deadline ]]; then
      log "WARNING: ${label} did not become ready within ${WAIT_TIMEOUT}s"
      return 1
    fi
    log "  ${label} not ready yet, retrying in 5s..."
    sleep 5
  done
}

[[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

log "Using compose file: $COMPOSE_FILE"

log "Pulling GhostL3 service images..."
docker compose -f "$COMPOSE_FILE" pull --quiet "${L3_SERVICES[@]}" 2>/dev/null || \
  log "WARNING: Image pull failed (may use cached images)"

log "Starting GhostL3 custom services..."
docker compose -f "$COMPOSE_FILE" --project-name "$PROJECT_NAME" up -d "${L3_SERVICES[@]}" || true

wait_for_http "http://localhost:7270/status" "GhostL3 execution service"
wait_for_http "http://localhost:7273/status" "GhostL3 settlement service"

log "GhostL3 custom services started."
log "  Host RPC prerequisite : http://localhost:${L3_RPC_PORT}"
log "  ghost-exec-l3         : http://localhost:7270/status"
log "  ghost-settlement-l3   : http://localhost:7273/status"
