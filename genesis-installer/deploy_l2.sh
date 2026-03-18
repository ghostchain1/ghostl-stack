#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostL2
#
# Starts the GhostL2 OP Stack rollup node anchored to GhostChain L1.
# Runs preflight validation before starting to catch misconfiguration early.
#
# Compose file: infra/opstack/docker-compose.l2-node.yml
# Services:     l2-geth, op-node
# Chain ID:     901
# RPC port:     29547
#
# Settlement target: GhostChain L1 (chain_id=14000101, port 18545)
# L2 NEVER contacts external chains directly — all cross-chain traffic
# routes through GhostChain L1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/opstack/docker-compose.l2-node.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [deploy_l2] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [deploy_l2] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${GHOSTL2_WAIT_S:-180}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# OP Stack preflight (validates rollup.json and L1 connectivity)
# ---------------------------------------------------------------------------

run_preflight() {
  if [[ -f "${ROOT}/package.json" ]] && \
     grep -q '"preflight:opstack"' "${ROOT}/package.json" 2>/dev/null; then
    info "Running OP Stack preflight…"
    npm --prefix "${ROOT}" run preflight:opstack || fatal "OP Stack preflight failed."
  else
    info "preflight:opstack script not found — skipping (run manually if needed)."
  fi
}

# ---------------------------------------------------------------------------
# Wait for L2 RPC
# ---------------------------------------------------------------------------

wait_for_l2_rpc() {
  info "Waiting for GhostL2 RPC on port 29547 (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:29547 >/dev/null 2>&1
  do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      fatal "GhostL2 RPC did not become ready within ${WAIT_TIMEOUT_S}s."
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "GhostL2 RPC ready (${elapsed}s)."
}

# ---------------------------------------------------------------------------
# Verify L1 is reachable before starting L2
# ---------------------------------------------------------------------------

verify_l1() {
  info "Verifying GhostChain L1 is reachable at port 18545…"
  curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:18545 >/dev/null 2>&1 \
    || fatal "GhostChain L1 RPC not available. Deploy L1 first (deploy_l1.sh)."
  info "L1 reachable."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "=== Deploying GhostL2 ==="
info "Compose file: ${COMPOSE_FILE}"

[[ -f "${COMPOSE_FILE}" ]] || fatal "Compose file not found: ${COMPOSE_FILE}"

hg_docker_init
verify_l1
run_preflight

cd "${ROOT}"

info "Pulling L2 images…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" pull --quiet 2>&1 | tail -5 || true

info "Starting l2-geth…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d l2-geth

info "Starting op-node…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d op-node

wait_for_l2_rpc

info "GhostL2 deployed."
info "  RPC      : http://localhost:29547"
info "  Chain ID : 901"
info "  Settles to L1 chain_id=14000101"
