#!/bin/sh
set -eu

echo "[ghost-op-proposer] GhostStack OP proposer"
echo "[ghost-op-proposer] layer=${GHOST_LAYER:-unset} role=${GHOST_ROLE:-proposer}"
echo "[ghost-op-proposer] delegating to: $*"

exec "$@"
