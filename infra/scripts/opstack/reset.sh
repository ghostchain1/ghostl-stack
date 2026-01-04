#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

HOST_UID=${LOCAL_UID:-$(id -u)}
HOST_GID=${LOCAL_GID:-$(id -g)}
echo "Reclaiming data ownership (UID $HOST_UID GID $HOST_GID)..."

chown_data_dir() {
  local target="$1"
  if [ ! -d "$target" ]; then
    return 0
  fi
  docker run --rm -v "${target}:/data" busybox chown -R "${HOST_UID}:${HOST_GID}" /data >/dev/null 2>&1 || true
}

chown_data_dir "$OP_DIR/data/l2-geth"
chown_data_dir "$OP_DIR/data/op-node"

echo "Stopping OP Stack devnet..."
cd "$OP_DIR"
docker compose down -v || true

chown_data_dir "$OP_DIR/data/l2-geth"
chown_data_dir "$OP_DIR/data/op-node"

echo "Removing data dirs..."
rm -rf "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
mkdir -p "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"

echo "Reset complete."
