#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run start:api:prod &
API_PID=$!

npm run start:worker:prod &
WORKER_PID=$!

cleanup() {
  kill "$API_PID" "$WORKER_PID" >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

wait -n "$API_PID" "$WORKER_PID"