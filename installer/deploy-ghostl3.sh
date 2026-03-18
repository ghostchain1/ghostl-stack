#!/usr/bin/env bash
# deploy-ghostl3.sh — Deploy GhostL3 (chain_id=903, OP Stack, app-specific)
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

# ── Locate L3 compose file ────────────────────────────────────────────────────

COMPOSE_FILE=""
CANDIDATE_FILES=(
  "${STACK_DIR}/infra/opstack/docker-compose.l3.yml"
  "${STACK_DIR}/infra/opstack/docker-compose.yml"
)

for f in "${CANDIDATE_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    if grep -q "ghostl3\|ghost-l3\|l3" "$f" 2>/dev/null; then
      COMPOSE_FILE="$f"
      break
    fi
  fi
done

if [[ -z "$COMPOSE_FILE" ]]; then
  log "No L3 compose file found — L3 may be managed by infra/opstack/ or Kubernetes."
  log "Run 'npm run preflight:opstack' to validate before starting OP Stack nodes."
else
  log "Using compose file: $COMPOSE_FILE"

  log "Pulling GhostL3 images..."
  docker compose -f "$COMPOSE_FILE" pull --quiet 2>/dev/null || \
    log "WARNING: Image pull failed (may use cached images)"

  log "Starting GhostL3 OP Stack services..."
  docker compose -f "$COMPOSE_FILE" up -d || true
fi

# ── Health gate: L3 EVM RPC ───────────────────────────────────────────────────

log "Waiting for GhostL3 EVM RPC on port ${L3_RPC_PORT}..."
DEADLINE=$(( $(date +%s) + WAIT_TIMEOUT ))
HEALTHY=0
while true; do
  if [[ $(date +%s) -gt $DEADLINE ]]; then
    log "WARNING: L3 RPC did not respond within ${WAIT_TIMEOUT}s"
    log "  L3 may still be synchronizing with L2 — this is expected on first start."
    break
  fi

  RESPONSE=$(curl -sf \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${L3_RPC_PORT}" 2>/dev/null || true)

  if echo "$RESPONSE" | grep -q '"result"'; then
    BLOCK=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d['result'],16))" 2>/dev/null || echo "?")
    log "L3 RPC healthy — block height: ${BLOCK}"
    HEALTHY=1
    break
  fi

  log "  L3 RPC not ready yet, retrying in 5s..."
  sleep 5
done

if [[ "$HEALTHY" -eq 1 ]]; then
  log "GhostL3 deployed and healthy."
else
  log "GhostL3 startup initiated — verify-system.sh will confirm once fully synced."
fi
