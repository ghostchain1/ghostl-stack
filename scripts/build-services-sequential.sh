#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_ROOT="${ROOT_DIR}/services"
shift || true

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if [ ! -d "$SERVICE_ROOT" ]; then
  echo "Service root not found: $SERVICE_ROOT" >&2
  exit 1
fi

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
  docker compose -f "$file" build "$@"
  echo "<---- Built $svc_name"
  echo
  sleep 1
  if docker compose -f "$file" ps >/dev/null 2>&1; then
    :
  fi
done

echo "All services built successfully."
