#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

echo "Stopping OP Stack devnet..."
cd "$OP_DIR"
docker compose down -v || true

HOST_UID=${LOCAL_UID:-$(id -u)}
HOST_GID=${LOCAL_GID:-$(id -g)}
echo "Reclaiming data ownership (UID $HOST_UID GID $HOST_GID)..."
# run through containers so chown has the permissions it needs
{
  docker compose run --rm --entrypoint sh l2-geth -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1 &&
  docker compose run --rm --entrypoint sh op-node -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1
} || true

echo "Removing data dirs..."
rm -rf "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
mkdir -p "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"

echo "Reset complete."
