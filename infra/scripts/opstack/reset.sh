#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"
L3_NAME="${L3_NAME:-ghostl3}"

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
chown_data_dir "$OP_DIR/data/l1-geth"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    chown_data_dir "$l3_dir/data"
    chown_data_dir "$l3_dir/data/op-node"
  done
fi

echo "Stopping OP Stack devnet..."
bash "$ROOT/infra/scripts/opstack/down-l3.sh" || true
bash "$ROOT/infra/scripts/opstack/down-l2.sh" || true

chown_data_dir "$OP_DIR/data/l2-geth"
chown_data_dir "$OP_DIR/data/op-node"
chown_data_dir "$OP_DIR/data/l1-geth"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    chown_data_dir "$l3_dir/data"
    chown_data_dir "$l3_dir/data/op-node"
  done
fi

echo "Removing data dirs..."
rm -rf "$OP_DIR/data/l1-geth" "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
mkdir -p "$OP_DIR/data/l1-geth" "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    if [ -d "$l3_dir" ]; then
      rm -rf "$l3_dir/data"
      mkdir -p "$l3_dir/data" "$l3_dir/data/op-node"
    fi
  done
fi

echo "Reset complete."
