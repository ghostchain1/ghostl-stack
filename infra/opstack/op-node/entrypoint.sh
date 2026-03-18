#!/bin/sh
set -eu

echo "[ghost-op-node] GhostStack OP rollup node"
echo "[ghost-op-node] layer=${GHOST_LAYER:-unset} role=${GHOST_ROLE:-rollup}"
echo "[ghost-op-node] delegating to: $*"

exec "$@"
