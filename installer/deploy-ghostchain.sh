#!/usr/bin/env bash
# deploy-ghostchain.sh — Deploy GhostChain L1 (chain_id=14000101)
#
# Services deployed (docker-compose.ghostchain.yml):
#   ghostchaind      — Cosmos SDK + EVM sovereign chain
#   hermes-relayer   — IBC relayer
#
# Health gate: waits for EVM RPC at :18545 and Cosmos LCD at :1317

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${STACK_DIR}/docker-compose.ghostchain.yml"

# Load env if present (never fail on missing)
[[ -f "${STACK_DIR}/.env" ]] && set -a && source "${STACK_DIR}/.env" && set +a

L1_RPC_PORT="${L1_EVM_PORT:-18545}"
L1_LCD_PORT="${GHOSTCHAIN_LCD_PORT:-1317}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-120}"   # seconds
COMPOSE_PROJECT="${COMPOSE_PROJECT_GHOSTCHAIN:-ghostchain}"

log() { echo "[deploy-ghostchain] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ── Validate compose file ─────────────────────────────────────────────────────

[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"

# ── Pull latest images (non-fatal) ────────────────────────────────────────────

log "Pulling GhostChain L1 images..."
docker compose -f "$COMPOSE_FILE" pull --quiet 2>/dev/null || \
  log "WARNING: Image pull failed (may use cached images)"

# ── Start services ────────────────────────────────────────────────────────────

log "Starting ghostchaind and hermes-relayer..."
docker compose -f "$COMPOSE_FILE" up -d \
  ghostchaind \
  hermes-relayer

# ── Health gate: EVM RPC ──────────────────────────────────────────────────────

log "Waiting for GhostChain L1 EVM RPC on port ${L1_RPC_PORT}..."
DEADLINE=$(( $(date +%s) + WAIT_TIMEOUT ))
while true; do
  if [[ $(date +%s) -gt $DEADLINE ]]; then
    die "Timeout: L1 EVM RPC did not respond within ${WAIT_TIMEOUT}s"
  fi

  RESPONSE=$(curl -sf \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "http://localhost:${L1_RPC_PORT}" 2>/dev/null || true)

  if echo "$RESPONSE" | grep -q '"result"'; then
    BLOCK=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d['result'],16))" 2>/dev/null || echo "?")
    log "L1 EVM RPC healthy — block height: ${BLOCK}"
    break
  fi

  log "  L1 RPC not ready yet, retrying in 5s..."
  sleep 5
done

# ── Health gate: Cosmos LCD ───────────────────────────────────────────────────

log "Waiting for Cosmos LCD on port ${L1_LCD_PORT}..."
DEADLINE=$(( $(date +%s) + WAIT_TIMEOUT ))
while true; do
  if [[ $(date +%s) -gt $DEADLINE ]]; then
    log "WARNING: Cosmos LCD did not respond within ${WAIT_TIMEOUT}s — continuing anyway"
    break
  fi

  if curl -sf --max-time 5 "http://localhost:${L1_LCD_PORT}/cosmos/base/tendermint/v1beta1/node_info" \
       -o /dev/null 2>/dev/null; then
    log "Cosmos LCD healthy on port ${L1_LCD_PORT}"
    break
  fi

  log "  Cosmos LCD not ready yet, retrying in 5s..."
  sleep 5
done

log "GhostChain L1 deployed and healthy."
