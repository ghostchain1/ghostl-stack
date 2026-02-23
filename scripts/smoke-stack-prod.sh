#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3200}"
WORKER_HEALTH_PORT="${WORKER_HEALTH_PORT:-4100}"

if [[ -z "${GHOSTWALLET_MASTER_KEY:-}" ]]; then
  echo "[smoke] missing required env: GHOSTWALLET_MASTER_KEY" >&2
  exit 1
fi

STACK_LOG="${STACK_LOG:-/tmp/ghostl-stack-prod-smoke.log}"

mkdir -p apps/api/data apps/worker/data

echo "[smoke] starting stack via start:stack:prod"
npm run start:stack:prod >"$STACK_LOG" 2>&1 &
STACK_PID=$!

cleanup() {
  kill "$STACK_PID" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

check_http_status() {
  local name="$1"
  local url="$2"
  local expected_pattern="$3"
  local attempts="${4:-60}"

  local code="000"
  for ((i = 1; i <= attempts; i++)); do
    code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    if [[ "$code" =~ $expected_pattern ]]; then
      echo "[smoke] $name OK ($code)"
      return 0
    fi
    sleep 1
  done

  echo "[smoke] $name FAILED (last=$code url=$url)" >&2
  echo "[smoke] stack log: $STACK_LOG" >&2
  tail -n 80 "$STACK_LOG" >&2 || true
  return 1
}

check_http_status "api" "http://127.0.0.1:${API_PORT}/health" '^200$'
check_http_status "worker" "http://127.0.0.1:${WORKER_HEALTH_PORT}/health" '^200$'
check_http_status "web" "http://127.0.0.1:${WEB_PORT}/" '^[23][0-9][0-9]$'

echo "[smoke] snapshot"
echo "  api=http://127.0.0.1:${API_PORT}/health -> 200"
echo "  worker=http://127.0.0.1:${WORKER_HEALTH_PORT}/health -> 200"
echo "  web=http://127.0.0.1:${WEB_PORT}/ -> 2xx/3xx"
