#!/bin/bash
set -euo pipefail

if [ -n "${HEALTHCHECK_CMD:-}" ]; then
  eval "$HEALTHCHECK_CMD"
  exit $?
fi

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -sf "$HEALTHCHECK_URL" >/dev/null
  exit $?
fi

PORT=${GHOSTAI_PORT:-7610}
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && exit 0

echo "[ghostcontract-ai] healthcheck failed on port ${PORT}" >&2
exit 1
