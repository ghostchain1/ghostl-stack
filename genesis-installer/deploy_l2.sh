#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostL2
#
# Starts the GhostL2 custom execution service bundle anchored to GhostChain L1.
# Runs compose validation before starting to catch misconfiguration early.
#
# Compose file: docker-compose.custom-rollup.yml
# Services:     ghost-exec-l2, ghost-sequencer-l2, ghost-deriver-l2,
#               ghost-settlement-l2, ghost-bridge-l2, ghost-proof-l2
# Chain ID:     901
# RPC port:     29547
#
# Settlement target: GhostChain L1 (chain_id=14000101, port 18545)
# L2 NEVER contacts external chains directly — all cross-chain traffic
# routes through GhostChain L1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/docker-compose.custom-rollup.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"
L2_SERVICES=(
  ghost-exec-l2
  ghost-sequencer-l2
  ghost-deriver-l2
  ghost-settlement-l2
  ghost-bridge-l2
  ghost-proof-l2
)

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info()  { echo "[$(date +%H:%M:%S)] [deploy_l2] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] [deploy_l2] FATAL: $*" >&2; exit 1; }

WAIT_TIMEOUT_S="${GHOSTL2_WAIT_S:-180}"
HEALTH_RETRY_INTERVAL_S=5

# ---------------------------------------------------------------------------
# Ghost-native preflight (validates compose shape)
# ---------------------------------------------------------------------------

run_preflight() {
  info "Resolving Ghost-native compose config…"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" config >/dev/null \
    || fatal "Ghost-native compose config validation failed."
}

# ---------------------------------------------------------------------------
# Wait for L2 services
# ---------------------------------------------------------------------------

wait_for_http() {
  local url="$1"
  local label="$2"
  info "Waiting for ${label} (timeout ${WAIT_TIMEOUT_S}s)…"
  local elapsed=0
  until curl -sf "$url" >/dev/null 2>&1
  do
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT_S}" ]]; then
      fatal "${label} did not become ready within ${WAIT_TIMEOUT_S}s."
    fi
    sleep "${HEALTH_RETRY_INTERVAL_S}"
    elapsed=$(( elapsed + HEALTH_RETRY_INTERVAL_S ))
  done
  info "${label} ready (${elapsed}s)."
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

info "Pulling L2 service images…"
hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" pull --quiet "${L2_SERVICES[@]}" 2>&1 | tail -5 || true

for svc in "${L2_SERVICES[@]}"; do
  info "Starting ${svc}…"
  hg_docker compose -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d "${svc}"
done

wait_for_http "http://localhost:7260/status" "GhostL2 execution service"
wait_for_http "http://localhost:7263/status" "GhostL2 settlement service"

info "GhostL2 deployed."
info "  Host RPC prerequisite : http://localhost:29547"
info "  ghost-exec-l2         : http://localhost:7260/status"
info "  ghost-settlement-l2   : http://localhost:7263/status"
info "  Chain ID : 901"
info "  Settles to L1 chain_id=14000101"
