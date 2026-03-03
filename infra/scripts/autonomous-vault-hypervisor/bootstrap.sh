#!/usr/bin/env bash
# infra/scripts/autonomous-vault-hypervisor/bootstrap.sh
# Bootstrap the autonomous-vault-hypervisor service for dev or production.
# Usage: bash bootstrap.sh [dev|prod]
set -euo pipefail

MODE="${1:-dev}"
SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../services/autonomous-vault-hypervisor" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

log() { echo "[avh-bootstrap] $*"; }

log "=== Autonomous Vault Hypervisor Bootstrap (mode: ${MODE}) ==="
log "Service dir: ${SERVICE_DIR}"

# ── 1. Copy env if missing ─────────────────────────────────────────────────
if [[ ! -f "${SERVICE_DIR}/.env" ]]; then
  cp "${SERVICE_DIR}/.env.example" "${SERVICE_DIR}/.env"
  log "Created .env from .env.example — edit it before production!"
fi

# ── 2. Ensure Docker network exists ───────────────────────────────────────
if ! docker network ls --format '{{.Name}}' | grep -q "^ghost_net$"; then
  log "Creating docker network: ghost_net"
  docker network create ghost_net || true
fi

# ── 3. Build the image ─────────────────────────────────────────────────────
log "Building Docker image..."
docker build -t ghostl/autonomous-vault-hypervisor:local "${SERVICE_DIR}"

# ── 4. Start the service ───────────────────────────────────────────────────
log "Starting service via docker compose..."
docker compose \
  -f "${ROOT_DIR}/docker-compose.autonomy.yml" \
  --env-file "${ROOT_DIR}/stack.env" \
  up -d autonomous-vault-hypervisor

# ── 5. Wait for health ────────────────────────────────────────────────────
log "Waiting for health check..."
MAX_WAIT=60
ELAPSED=0
until curl -sf http://localhost:7720/health >/dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [[ ${ELAPSED} -ge ${MAX_WAIT} ]]; then
    log "ERROR: Service did not become healthy within ${MAX_WAIT}s"
    docker logs ghost_autonomous-vault-hypervisor 2>&1 | tail -20
    exit 1
  fi
  log "  ... waiting (${ELAPSED}s)"
done

log "✓ autonomous-vault-hypervisor is healthy at http://localhost:7720"
log ""
log "Quick status:"
curl -s http://localhost:7720/status | python3 -m json.tool 2>/dev/null || \
  curl -s http://localhost:7720/status
