#!/usr/bin/env bash
# Spin up the local stack: op-stack docker services + local API/web processes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/infra/opstack/docker-compose.yml"
OPSTACK_ENV_FILE="$ROOT/infra/opstack/.env"
OPSTACK_SECRETS_FILE="$ROOT/infra/opstack/.env.secrets"
PROJECT_NAME="ghostl-stack"
RUN_DIR="$ROOT/.tmp/dev-stack"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
API_LOG_FILE="$RUN_DIR/api.log"
WEB_LOG_FILE="$RUN_DIR/web.log"

# shellcheck source=scripts/lib/docker.sh
. "$ROOT/scripts/lib/docker.sh"

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

hg_require_docker_compose
need_cmd node
need_cmd npm

cd "$ROOT"
node "$ROOT/scripts/node-check.mjs"
npm ci --prefer-offline

copy_env "$ROOT/apps/api/.env.local.example" "$ROOT/apps/api/.env.local"
copy_env "$ROOT/apps/web/.env.local.example" "$ROOT/apps/web/.env.local"

echo "Starting op-stack services via docker-compose..."
COMPOSE_ENV_ARGS=()
if [[ -f "$OPSTACK_ENV_FILE" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OPSTACK_ENV_FILE")
fi
if [[ -f "$OPSTACK_SECRETS_FILE" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file "$OPSTACK_SECRETS_FILE")
fi
hg_docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" --project-name "$PROJECT_NAME" up -d

mkdir -p "$RUN_DIR"

stop_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

stop_if_running "$API_PID_FILE"
stop_if_running "$WEB_PID_FILE"

echo "Starting API + web via npm workspaces..."
npm run dev -w apps/api >"$API_LOG_FILE" 2>&1 &
echo "$!" >"$API_PID_FILE"
npm run dev -w apps/web >"$WEB_LOG_FILE" 2>&1 &
echo "$!" >"$WEB_PID_FILE"

echo "Stack is starting."
echo "Docker project: $PROJECT_NAME (see: docker compose -f $COMPOSE_FILE --project-name $PROJECT_NAME ps)"
echo "API PID: $(cat "$API_PID_FILE") (log: $API_LOG_FILE)"
echo "WEB PID: $(cat "$WEB_PID_FILE") (log: $WEB_LOG_FILE)"
