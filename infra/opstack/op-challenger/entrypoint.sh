#!/bin/sh
set -eu

echo "[ghost-op-challenger] GhostStack OP challenger"
echo "[ghost-op-challenger] layer=${GHOST_LAYER:-unset} role=${GHOST_ROLE:-challenger}"
echo "[ghost-op-challenger] delegating to: $*"

exec "$@"
