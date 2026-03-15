#!/usr/bin/env bash
# LitVybzLive — Rollback
# Usage: bash devops/scripts/rollback.sh <service> [image_tag]
#
# Rolls a service back to a previous Docker image tag.
# If image_tag is omitted, lists the last 5 known tags.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../compose/docker-compose.full.yml"
REGISTRY="${REGISTRY:-ghcr.io/ghostchain}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SVC="${1:?Usage: rollback.sh <service> [image_tag]}"
TAG="${2:-}"

[[ -f "${COMPOSE_FILE}" ]] || die "Compose file not found: ${COMPOSE_FILE}"

# Map service name to image name
case "${SVC}" in
  mediasoup-server|webrtc-gateway|stream-controller|\
  edge-node-*|ffmpeg-transcoder|redis-bus)
    IMG="litvyblive-stream"
    ;;
  *)
    IMG="litvyblive-api"
    ;;
esac

if [[ -z "${TAG}" ]]; then
  info "No tag specified — showing local image history for ${REGISTRY}/${IMG}:"
  docker images "${REGISTRY}/${IMG}" --format "table {{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" \
    | head -10
  echo ""
  echo "Re-run: bash rollback.sh ${SVC} <tag>"
  exit 0
fi

FULL_IMAGE="${REGISTRY}/${IMG}:${TAG}"
info "Rolling back ${SVC} to ${FULL_IMAGE} …"

# Verify the image exists locally or can be pulled
if ! docker image inspect "${FULL_IMAGE}" &>/dev/null; then
  info "Image not found locally — attempting pull …"
  docker pull "${FULL_IMAGE}" || die "Cannot pull ${FULL_IMAGE} — check registry and tag"
fi

# Tag it as the service-specific override
override_img="${IMG}-${SVC}:rollback"
docker tag "${FULL_IMAGE}" "${override_img}"

info "Stopping current ${SVC} container …"
docker compose -f "${COMPOSE_FILE}" stop "${SVC}"

info "Starting ${SVC} with rollback image …"
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate "${SVC}"

ok "Rollback complete: ${SVC} → ${FULL_IMAGE}"
docker compose -f "${COMPOSE_FILE}" ps "${SVC}"
