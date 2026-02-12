#!/usr/bin/env bash
# Spin up the local stack: op-stack docker services + PM2 for API and web.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/infra/opstack/docker-compose.yml"
PROJECT_NAME="ghostl-stack"
PM2_BIN="$ROOT/node_modules/.bin/pm2"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_docker_compose() {
  docker compose version >/dev/null 2>&1 || {
    echo "Missing required command: docker compose" >&2
    echo "Install Docker Compose v2 (plugin) or upgrade Docker." >&2
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
need_docker_compose
need_cmd node
need_cmd npm

cd "$ROOT"
node "$ROOT/scripts/node-check.mjs"

if [[ ! -x "$PM2_BIN" ]]; then
  echo "Installing JS dependencies (npm ci)..." >&2
  npm ci
fi

copy_env "$ROOT/apps/api/.env.local.example" "$ROOT/apps/api/.env.local"
copy_env "$ROOT/apps/web/.env.local.example" "$ROOT/apps/web/.env.local"

echo "Starting op-stack services via docker-compose..."
docker compose -f "$COMPOSE_FILE" --project-name "$PROJECT_NAME" up -d

echo "Starting API + web via PM2..."
"$PM2_BIN" start "$ROOT/ecosystem.config.cjs" --only ghostl-api,ghostl-web --env dev
"$PM2_BIN" save

echo "Stack is starting."
echo "Docker project: $PROJECT_NAME (see: docker compose -f $COMPOSE_FILE --project-name $PROJECT_NAME ps)"
echo "PM2 list:"
"$PM2_BIN" list
