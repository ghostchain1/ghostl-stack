#!/usr/bin/env bash
# Spin up the local stack: op-stack docker services + PM2 for API and web.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/infra/opstack/docker-compose.yml"
PROJECT_NAME="ghostl-stack"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

copy_env() {
  local example="$1" target="$2"
  if [[ ! -f "$target" && -f "$example" ]]; then
    cp "$example" "$target"
    echo "Created $target from $(basename "$example")"
  fi
}

need_cmd docker
need_cmd pm2

copy_env "$ROOT/apps/api/.env.local.example" "$ROOT/apps/api/.env.local"
copy_env "$ROOT/apps/web/.env.local.example" "$ROOT/apps/web/.env.local"

echo "Starting op-stack services via docker-compose..."
docker compose -f "$COMPOSE_FILE" --project-name "$PROJECT_NAME" up -d

echo "Starting API + web via PM2..."
pm2 start "$ROOT/ecosystem.config.cjs" --only ghostl-api,ghostl-web --env dev
pm2 save

echo "Stack is starting."
echo "Docker project: $PROJECT_NAME (see: docker compose -f $COMPOSE_FILE --project-name $PROJECT_NAME ps)"
echo "PM2 list:"
pm2 list
