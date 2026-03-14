#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostChain L1
#
# Starts the GhostChain sovereign L1 node (Cosmos SDK / CometBFT).
# Compose file: docker-compose.ghostchain.yml
# Services:     ghostchaind, hermes-relayer
# Chain ID:     14000101  (Cosmos chain: ghostchain-1)
# RPC port:     18545 (EVM)  26657 (CometBFT)  1317 (Cosmos REST)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/docker-compose.ghostchain.yml"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [deploy_l1] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [deploy_l1] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${GHOSTCHAIN_L1_WAIT_S:-120}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# Wait for L1 EVM RPC to accept connections
# ---------------------------------------------------------------------------

wait_for_l1_rpc() {
  info "Waiting for GhostChain L1 EVM RPC on port 18545 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:18545 >/dev/null 2>&1
  do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      fatal "L1 RPC did not become ready within ${WAIT_TIMEOUT_S}s."
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "GhostChain L1 EVM RPC ready (${elapsed}s)."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Deploying GhostChain L1 ==="
info "Compose file: ${COMPOSE_FILE}"

[[ -f "${COMPOSE_FILE}" ]] || fatal "Compose file not found: ${COMPOSE_FILE}"

hg_docker_init

cd "${ROOT}"

# Pull images before starting (avoid partial starts due to pull latency).
info "Pulling L1 images…"
hg_docker compose -f "${COMPOSE_FILE}" pull --quiet 2>&1 | tail -5 || true

info "Starting ghostchaind…"
hg_docker compose -f "${COMPOSE_FILE}" up -d ghostchaind

wait_for_l1_rpc

info "Starting hermes-relayer (IBC cross-chain relayer)…"
hg_docker compose -f "${COMPOSE_FILE}" up -d hermes-relayer || {
  info "hermes-relayer service not found or optional — continuing."
}

info "GhostChain L1 deployed."
info "  EVM RPC    : http://localhost:18545"
info "  CometBFT   : http://localhost:26657"
info "  Cosmos REST: http://localhost:1317"
info "  Chain ID   : 14000101 / ghostchain-1"
