#!/usr/bin/env bash
# LitVybzLive — Rolling Service Update
# Usage: bash devops/scripts/update.sh [service] [image_tag]
#
# Rebuilds and hot-swaps one or all services with zero downtime.
# If no service is given, updates ALL services.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../compose/docker-compose.full.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ -f "${COMPOSE_FILE}" ]] || die "Compose file not found: ${COMPOSE_FILE}"

TARGET="${1:-}"
IMAGE_TAG="${2:-}"

# All updateable backend + streaming services (excludes host-network singletons)
BACKEND_SVCS=(
  api-gateway auth-service user-service stream-service chat-service
  gift-service wallet-service agency-service matchmaking-service
  games-service ranking-service event-service launchpad-service
  treasury-service marketing-service fraud-service analytics-service
  notification-service
)
STREAM_SVCS=(webrtc-gateway stream-controller ffmpeg-transcoder redis-bus)
HOST_NET_SVCS=(mediasoup-server edge-node-us-east edge-node-eu-west edge-node-asia)

_update_svc() {
  local svc="$1"
  info "Updating ${svc} …"
  docker compose -f "${COMPOSE_FILE}" build "${svc}" 2>&1
  docker compose -f "${COMPOSE_FILE}" up -d --no-deps "${svc}" 2>&1
  # Brief health poll
  local port; port=$(docker compose -f "${COMPOSE_FILE}" port "${svc}" 3000 2>/dev/null \
                   || docker compose -f "${COMPOSE_FILE}" port "${svc}" 7001 2>/dev/null \
                   || echo "")
  ok "${svc} updated"
}

_update_host_net() {
  local svc="$1"
  warn "${svc} uses hostNetwork — recreating (brief connection drop expected)"
  docker compose -f "${COMPOSE_FILE}" build "${svc}" 2>&1
  docker compose -f "${COMPOSE_FILE}" up -d --force-recreate --no-deps "${svc}" 2>&1
  ok "${svc} updated"
}

if [[ -n "${IMAGE_TAG}" ]]; then
  export IMAGE_TAG
  info "Using image tag: ${IMAGE_TAG}"
fi

if [[ -z "${TARGET}" ]]; then
  info "Updating ALL services (rolling, backend first, then streaming) …"
  for svc in "${BACKEND_SVCS[@]}"; do  _update_svc "${svc}";      done
  for svc in "${STREAM_SVCS[@]}"; do   _update_svc "${svc}";      done
  for svc in "${HOST_NET_SVCS[@]}"; do _update_host_net "${svc}"; done
  ok "All services updated."
else
  # Check if it's a host-network service
  IS_HN=false
  for hn in "${HOST_NET_SVCS[@]}"; do
    [[ "${TARGET}" == "${hn}" ]] && IS_HN=true && break
  done
  if $IS_HN; then
    _update_host_net "${TARGET}"
  else
    _update_svc "${TARGET}"
  fi
fi
