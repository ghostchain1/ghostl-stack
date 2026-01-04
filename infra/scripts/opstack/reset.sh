#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

HOST_UID=${LOCAL_UID:-$(id -u)}
HOST_GID=${LOCAL_GID:-$(id -g)}
echo "Reclaiming data ownership (UID $HOST_UID GID $HOST_GID)..."
# try exec first if containers are running
{
  docker compose exec -T l2-geth sh -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1
  docker compose exec -T op-node sh -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1
} || true
# fall back to run (in case containers stopped already)
{
  docker compose run --rm --entrypoint sh l2-geth -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1
  docker compose run --rm --entrypoint sh op-node -c "chown -R ${HOST_UID}:${HOST_GID} /data" >/dev/null 2>&1
} || true

echo "Stopping OP Stack devnet..."
cd "$OP_DIR"
docker compose down -v || true

echo "Removing data dirs..."
rm -rf "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
mkdir -p "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"

echo "Reset complete."
