#!/bin/sh
set -eu

echo "[ghost-op-batcher] GhostStack OP batcher"
echo "[ghost-op-batcher] layer=${GHOST_LAYER:-unset} role=${GHOST_ROLE:-batcher}"
echo "[ghost-op-batcher] delegating to: $*"

exec "$@"
