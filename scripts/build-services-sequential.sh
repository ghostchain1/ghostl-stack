#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_ROOT="${ROOT_DIR}/services"
shift || true

# shellcheck source=scripts/lib/docker.sh
. "${ROOT_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose

if [ ! -d "$SERVICE_ROOT" ]; then
  echo "Service root not found: $SERVICE_ROOT" >&2
  exit 1
fi

echo "Enforcing GST-native gates before build"
bash "${ROOT_DIR}/scripts/gst-leakage-gate.sh"
bash "${ROOT_DIR}/scripts/gst-symbol-gate.sh"

mapfile -t COMPOSE_FILES < <(find "$SERVICE_ROOT" -mindepth 2 -maxdepth 2 -name docker-compose.yml -type f | sort)

if [ ${#COMPOSE_FILES[@]} -eq 0 ]; then
  echo "No per-service docker-compose.yml files found under $SERVICE_ROOT" >&2
  exit 0
fi

echo "Building services sequentially from per-service compose files"

for file in "${COMPOSE_FILES[@]}"; do
  svc_dir="$(dirname "$file")"
  svc_name="$(basename "$svc_dir")"
  echo "----> Building $svc_name"
  hg_docker compose -f "$file" build "$@"
  echo "<---- Built $svc_name"
  echo
  sleep 1
  if hg_docker compose -f "$file" ps >/dev/null 2>&1; then
    :
  fi
done

echo "All services built successfully."
