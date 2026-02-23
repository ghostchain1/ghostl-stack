#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3200}"
WORKER_HEALTH_PORT="${WORKER_HEALTH_PORT:-4100}"

PORT="$API_PORT" npm run start:api:prod &
API_PID=$!

WORKER_HEALTH_PORT="$WORKER_HEALTH_PORT" npm run start:worker:prod &
WORKER_PID=$!

PORT="$WEB_PORT" npm run start -w apps/web &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WORKER_PID" "$WEB_PID" >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

wait -n "$API_PID" "$WORKER_PID" "$WEB_PID"
