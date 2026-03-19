#!/usr/bin/env bash
# GhostStack Genesis Installer — Deploy GhostL3
#
# Starts the GhostL3 custom execution service bundle anchored to GhostL2.
# Settlement order: L3 → L2 → L1.  L3 NEVER bypasses L2.
#
# Compose file: docker-compose.custom-rollup.yml
# Services:     ghost-exec-l3, ghost-sequencer-l3, ghost-deriver-l3,
#               ghost-settlement-l3, ghost-bridge-l3, ghost-proof-l3
# Chain ID:     903
# RPC port:     39545

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl-stack}"
COMPOSE_FILE="${ROOT}/docker-compose.custom-rollup.yml"
SERVICES=(
  ghost-exec-l3
  ghost-sequencer-l3
  ghost-deriver-l3
  ghost-settlement-l3
  ghost-bridge-l3
  ghost-proof-l3
)

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
  info "Verifying GhostL2 is reachable at port 29547…"
  curl -sf \
      -X POST \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
      http://localhost:29547 >/dev/null 2>&1 \
    || fatal "GhostL2 RPC not available. Deploy L2 first (deploy_l2.sh)."
  info "L2 reachable."
}

# ---------------------------------------------------------------------------
# Wait for L3 services
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
# Main
# ---------------------------------------------------------------------------

info "=== Deploying GhostL3 ==="
info "Compose file: ${COMPOSE_FILE}"
info "Services    : ${SERVICES[*]}"

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

wait_for_http "http://localhost:7270/status" "GhostL3 execution service"
wait_for_http "http://localhost:7273/status" "GhostL3 settlement service"

info "GhostL3 deployed."
info "  Host RPC prerequisite : http://localhost:39545"
info "  ghost-exec-l3         : http://localhost:7270/status"
info "  ghost-settlement-l3   : http://localhost:7273/status"
info "  Chain ID  : 903"
info "  Settles to L2 chain_id=901 → L1 chain_id=14000101"
