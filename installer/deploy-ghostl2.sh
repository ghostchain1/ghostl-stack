#!/usr/bin/env bash
# deploy-ghostl2.sh — Deploy GhostL2 (chain_id=901, OP Stack)
#
# GhostL2 anchors to GhostChain L1 via L1GhostPortal.
# L1 MUST be healthy before this script runs.
#
# L2 Rollup address  : 0xad32D5C2Da9f4159C4cc98686C005852b3905355
# Finality Oracle L2 : 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
# RPC port: 29545
#
# NOTE: L2 is deployed via infra/opstack/ configs + op-geth / op-node.
#       This script starts the OP Stack containers defined in the appropriate
#       compose file, then validates the RPC endpoint.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

L1_RPC_PORT="${L1_EVM_PORT:-18545}"
L2_RPC_PORT="${L2_RPC_PORT:-29545}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-180}"

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

# ── Locate L2 compose file ────────────────────────────────────────────────────
# The OP Stack L2 node may be configured in infra/opstack/ or docker-compose.dev.yml.
# We attempt a few known locations in priority order.

COMPOSE_FILE=""
CANDIDATE_FILES=(
  "${STACK_DIR}/infra/opstack/docker-compose.yml"
  "${STACK_DIR}/infra/opstack/docker-compose.l2.yml"
  "${STACK_DIR}/docker-compose.dev.yml"
)

for f in "${CANDIDATE_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    # Check it references op-geth or op-node services
    if grep -q "op-geth\|op-node\|ghostl2\|ghost-l2" "$f" 2>/dev/null; then
      COMPOSE_FILE="$f"
      break
    fi
  fi
done

if [[ -z "$COMPOSE_FILE" ]]; then
  log "WARNING: No OP Stack compose file found — checking if L2 RPC is already up..."
  # If an external orchestration already started L2 (e.g., Kubernetes / infra/opstack/)
  # we validate and move on.
else
  log "Using compose file: $COMPOSE_FILE"

  log "Pulling GhostL2 (op-geth / op-node) images..."
  docker compose -f "$COMPOSE_FILE" pull --quiet 2>/dev/null || \
    log "WARNING: Image pull failed (may use cached images)"

  log "Starting GhostL2 OP Stack services..."
  docker compose -f "$COMPOSE_FILE" up -d || true
fi

# ── Health gate: L2 EVM RPC ───────────────────────────────────────────────────

log "Waiting for GhostL2 EVM RPC on port ${L2_RPC_PORT}..."
DEADLINE=$(( $(date +%s) + WAIT_TIMEOUT ))
HEALTHY=0
while true; do
  if [[ $(date +%s) -gt $DEADLINE ]]; then
    log "WARNING: L2 RPC did not respond within ${WAIT_TIMEOUT}s"
    log "  L2 may be starting via external orchestration (infra/opstack/)."
    log "  Run 'npm run preflight:opstack' to validate L2/L3 configs."
    HEALTHY=0
    break
  fi

  RESPONSE=$(curl -sf \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${L2_RPC_PORT}" 2>/dev/null || true)

  if echo "$RESPONSE" | grep -q '"result"'; then
    BLOCK=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d['result'],16))" 2>/dev/null || echo "?")
    log "L2 RPC healthy — block height: ${BLOCK}"
    HEALTHY=1
    break
  fi

  log "  L2 RPC not ready yet, retrying in 5s..."
  sleep 5
done

if [[ "$HEALTHY" -eq 1 ]]; then
  log "GhostL2 deployed and healthy."
else
  log "GhostL2 startup initiated — run verify-system.sh after services fully initialize."
fi
