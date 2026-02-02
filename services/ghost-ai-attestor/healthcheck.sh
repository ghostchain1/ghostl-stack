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

if [ -n "${PORT:-}" ]; then
  curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null && exit 0
  curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && exit 0
  curl -sf "http://127.0.0.1:${PORT}/" >/dev/null && exit 0
fi

echo "No healthcheck configured" >&2
exit 1

