#!/usr/bin/env bash
# deploy-ghostl2.sh — Deploy GhostL2 custom execution services (chain_id=901)
#
# GhostL2 anchors to GhostChain L1 via L1GhostPortal.
# L1 MUST be healthy before this script runs.
#
# L2 Rollup address  : 0xad32D5C2Da9f4159C4cc98686C005852b3905355
# Finality Oracle L2 : 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
# RPC port: 29547
#
# This script starts the Ghost-native L2 execution, sequencing, derivation,
# settlement, bridge, and proof services defined in docker-compose.custom-rollup.yml.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

L1_RPC_PORT="${L1_EVM_PORT:-18545}"
L2_RPC_PORT="${L2_RPC_PORT:-29547}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-180}"
COMPOSE_FILE="${STACK_DIR}/docker-compose.custom-rollup.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"
L2_SERVICES=(
  ghost-exec-l2
  ghost-sequencer-l2
  ghost-deriver-l2
  ghost-settlement-l2
  ghost-bridge-l2
  ghost-proof-l2
)

log() { echo "[deploy-ghostl2] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ── Verify L1 is still healthy before starting L2 ────────────────────────────

log "Verifying GhostChain L1 is healthy on port ${L1_RPC_PORT}..."
if ! curl -sf \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${L1_RPC_PORT}" \
    -o /dev/null 2>/dev/null; then
  die "L1 RPC is not responding on port ${L1_RPC_PORT}. Run deploy-ghostchain.sh first."
fi
log "L1 pre-check: OK"

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
log "Pulling GhostL2 service images..."
docker compose -f "$COMPOSE_FILE" pull --quiet "${L2_SERVICES[@]}" 2>/dev/null || \
  log "WARNING: Image pull failed (may use cached images)"

log "Starting GhostL2 custom services..."
docker compose -f "$COMPOSE_FILE" --project-name "$PROJECT_NAME" up -d "${L2_SERVICES[@]}" || true

wait_for_http "http://localhost:7260/status" "GhostL2 execution service"
wait_for_http "http://localhost:7263/status" "GhostL2 settlement service"

log "GhostL2 custom services started."
log "  Host RPC prerequisite : http://localhost:${L2_RPC_PORT}"
log "  ghost-exec-l2         : http://localhost:7260/status"
log "  ghost-settlement-l2   : http://localhost:7263/status"
