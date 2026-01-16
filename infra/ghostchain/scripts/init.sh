#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG="${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}"
CHAIN_ID="${CHAIN_ID:-14000101}"

BOOTNODE_DIR="$ROOT/data/bootnode"
NODE1_DIR="$ROOT/data/node1"
NODE2_DIR="$ROOT/data/node2"
GENESIS="$ROOT/geth/genesis.json"
PASSWORD="$ROOT/geth/password.txt"
BOOT_ENODE_FILE="$ROOT/config/bootnode-enode.txt"

mkdir -p "$ROOT/data" "$ROOT/config" "$BOOTNODE_DIR" "$NODE1_DIR" "$NODE2_DIR"

echo "[init] Using image: $IMG"

if [ ! -f "$BOOTNODE_DIR/boot.key" ]; then
  echo "[init] Generating bootnode key..."
  docker run --rm -v "$BOOTNODE_DIR":/data "$IMG" bootnode -genkey /data/boot.key
fi

echo "[init] Deriving bootnode enode..."
BOOT_ID="$(docker run --rm -v "$BOOTNODE_DIR":/data "$IMG" bootnode --nodekey /data/boot.key --writeaddress)"
echo "enode://$BOOT_ID@ghostchain-bootnode:30301" >"$BOOT_ENODE_FILE"
echo "[init] Bootnode enode written to $BOOT_ENODE_FILE"

init_node() {
  local name="$1"
  local dir="$2"
  local keyfile="$3"

  if [ -d "$dir/geth" ]; then
    echo "[init] $name already initialized, skipping."
    return
  fi

  echo "[init] Initializing $name..."
  docker run --rm \
    -v "$dir":/data \
    -v "$ROOT/geth":/config:ro \
    "$IMG" sh -c "\
      mkdir -p /data/keystore && \
      geth account import --datadir /data --password /config/password.txt /config/keys/$keyfile >/dev/null && \
      geth init --datadir /data /config/genesis.json"
}

init_node "node1" "$NODE1_DIR" "node1.key"
init_node "node2" "$NODE2_DIR" "node2.key"

echo "[init] Done. Datadirs are ready. Start the network with scripts/up.sh."
