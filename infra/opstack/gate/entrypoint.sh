#!/bin/sh
set -eu

echo "[ghost-op-gate] GhostChain branded OP transaction gate"
echo "[ghost-op-gate] port=${PORT:-8545} upstream=${UPSTREAM_RPC:-unset}"
echo "[ghost-op-gate] guard=${GUARD_EVAL_URL:-${GUARD_URL:-none}}"
echo "[ghost-op-gate] delegating to: $*"

exec "$@"
