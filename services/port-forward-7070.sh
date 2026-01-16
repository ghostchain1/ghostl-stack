#!/usr/bin/env bash
# Simple host-level forwarder to bypass docker-proxy quirks on port 7070.
set -euo pipefail
PORT=${PORT:-7070}
TARGET_HOST=${TARGET_HOST:-127.0.0.1}
TARGET_PORT=${TARGET_PORT:-7070}
echo "[forwarder] forwarding 0.0.0.0:${PORT} -> ${TARGET_HOST}:${TARGET_PORT}"
exec socat TCP-LISTEN:${PORT},fork,reuseaddr TCP:${TARGET_HOST}:${TARGET_PORT}
