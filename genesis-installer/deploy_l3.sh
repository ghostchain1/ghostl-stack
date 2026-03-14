#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostL3
#
# Starts the GhostL3 OP Stack rollup node anchored to GhostL2.
# Settlement order: L3 → L2 → L1.  L3 NEVER bypasses L2.
#
# Compose file: infra/opstack/docker-compose.l3-node.yml   (node only)
#               infra/opstack/docker-compose.l3.yml        (full stack: batcher+proposer)
# Services:     l3-geth, l3-op-node  [+ l3-op-batcher, l3-op-proposer if full]
# Chain ID:     903
# RPC port:     39545
#
# Full deployment (with batcher + proposer) requires
# GHOSTL3_FULL=1 environment variable.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

FULL="${GHOSTL3_FULL:-0}"
if [[ "${FULL}" == "1" ]]; then
  COMPOSE_FILE="${ROOT}/infra/opstack/docker-compose.l3.yml"
  SERVICES=(l3-geth l3-op-node l3-op-batcher l3-op-proposer)
else
  COMPOSE_FILE="${ROOT}/infra/opstack/docker-compose.l3-node.yml"
  SERVICES=(l3-geth l3-op-node)
fi

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [deploy_l3] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [deploy_l3] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${GHOSTL3_WAIT_S:-180}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# Verify L2 is reachable before starting L3
# ---------------------------------------------------------------------------

verify_l2() {
  info "Verifying GhostL2 is reachable at port 29545…"
  curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:29545 >/dev/null 2>&1 \
    || fatal "GhostL2 RPC not available. Deploy L2 first (deploy_l2.sh)."
  info "L2 reachable."
}

# ---------------------------------------------------------------------------
# Wait for L3 RPC
# ---------------------------------------------------------------------------

wait_for_l3_rpc() {
  info "Waiting for GhostL3 RPC on port 39545 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:39545 >/dev/null 2>&1
  do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      fatal "GhostL3 RPC did not become ready within ${WAIT_TIMEOUT_S}s."
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "GhostL3 RPC ready (${elapsed}s)."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Deploying GhostL3 ==="
info "Compose file: ${COMPOSE_FILE}"
info "Services    : ${SERVICES[*]}"
info "Full mode   : ${FULL}"

[[ -f "${COMPOSE_FILE}" ]] || fatal "Compose file not found: ${COMPOSE_FILE}"

hg_docker_init
verify_l2

cd "${ROOT}"

info "Pulling L3 images…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" pull --quiet 2>&1 | tail -5 || true

for svc in "${SERVICES[@]}"; do
  info "Starting ${svc}…"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d "${svc}"
done

wait_for_l3_rpc

info "GhostL3 deployed."
info "  RPC       : http://localhost:39545"
info "  Chain ID  : 903"
info "  Settles to L2 chain_id=901 → L1 chain_id=14000101"
[[ "${FULL}" == "1" ]] && info "  Batcher/Proposer: active" || info "  Tip: set GHOSTL3_FULL=1 to also start batcher + proposer."
