#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"
L3_NAME="${L3_NAME:-ghostl3}"

# Data directory locations (keep in sync with docker-compose.yml)
L1_DATA_DIR="${OP_DIR}/data/l1-geth-new"
L2_DATA_DIR="${OP_DIR}/data/l2-geth-new"
OP_NODE_DATA_DIR="${OP_DIR}/data/op-node"

# Default ownership for data dirs; can override via OWNER_USER/OWNER_GROUP.
OWNER_USER="${OWNER_USER:-ghost}"
OWNER_GROUP="${OWNER_GROUP:-ghost}"
HOST_UID=${LOCAL_UID:-$(id -u "$OWNER_USER" 2>/dev/null || echo 1000)}
HOST_GID=${LOCAL_GID:-$(id -g "$OWNER_GROUP" 2>/dev/null || echo 1000)}
echo "Reclaiming data ownership as ${OWNER_USER}:${OWNER_GROUP} (UID $HOST_UID GID $HOST_GID)..."

chown_data_dir() {
  local target="$1"
  if [ ! -d "$target" ]; then
    return 0
  fi
  docker run --rm -v "${target}:/data" busybox chown -R "${HOST_UID}:${HOST_GID}" /data >/dev/null 2>&1 || true
}

chown_data_dir "$L2_DATA_DIR"
chown_data_dir "$OP_NODE_DATA_DIR"
chown_data_dir "$L1_DATA_DIR"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    chown_data_dir "$l3_dir/data"
    chown_data_dir "$l3_dir/data/op-node"
  done
fi

echo "Stopping OP Stack devnet..."
bash "$ROOT/infra/scripts/opstack/down-l3.sh" || true
bash "$ROOT/infra/scripts/opstack/down-l2.sh" || true

chown_data_dir "$L2_DATA_DIR"
chown_data_dir "$OP_NODE_DATA_DIR"
chown_data_dir "$L1_DATA_DIR"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    chown_data_dir "$l3_dir/data"
    chown_data_dir "$l3_dir/data/op-node"
  done
fi

echo "Removing data dirs..."
rm -rf "$L1_DATA_DIR" "$L2_DATA_DIR" "$OP_NODE_DATA_DIR"
mkdir -p "$L1_DATA_DIR" "$L2_DATA_DIR" "$OP_NODE_DATA_DIR"
chown "${HOST_UID}:${HOST_GID}" "$L1_DATA_DIR" "$L2_DATA_DIR" "$OP_NODE_DATA_DIR"
if compgen -G "$OP_DIR/l3/*" >/dev/null; then
  for l3_dir in "$OP_DIR"/l3/*; do
    if [ -d "$l3_dir" ]; then
      rm -rf "$l3_dir/data"
      mkdir -p "$l3_dir/data" "$l3_dir/data/op-node"
    fi
  done
fi

echo "Reset complete."
