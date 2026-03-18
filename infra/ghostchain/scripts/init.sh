#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
ENV_FILE="$ROOT/.env.l1"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# shellcheck source=scripts/lib/docker.sh
. "${REPO_ROOT}/scripts/lib/docker.sh"
hg_docker_init

IMG="${L1_GETH_IMAGE:-${GETH_IMAGE:-ghostl/geth:alltools-v1.13.14}}"
CHAIN_ID="${L1_CHAIN_ID:-${CHAIN_ID:-14000101}}"
BOOTNODE_IP="${L1_BOOTNODE_IP:-${BOOTNODE_IP:-172.28.0.21}}"
BOOTNODE_PORT="${L1_BOOTNODE_PORT:-${BOOTNODE_PORT:-30301}}"
SECRETS_DIR="${L1_SECRETS_DIR:-$ROOT/secrets}"
L1_UID_VALUE="${L1_UID:-1000}"
L1_GID_VALUE="${L1_GID:-1000}"

BOOTNODE_DIR="$ROOT/data/bootnode"
NODE1_DIR="$ROOT/data/node1"
NODE2_DIR="$ROOT/data/node2"
GENESIS="$ROOT/geth/genesis.json"
PASSWORD="${L1_ACCOUNT_PASSWORD_FILE:-}"
BOOT_ENODE_FILE="$ROOT/config/bootnode-enode.txt"
BOOT_ENODE_DATA_FILE="$BOOTNODE_DIR/bootnode-enode.txt"

abspath() {
  local path="$1"
  case "$path" in
    /*) printf '%s\n' "$path" ;;
    *) printf '%s\n' "$REPO_ROOT/$path" ;;
  esac
}

ensure_owned() {
  local path="$1"
  local dir base

  if chown -R "$L1_UID_VALUE:$L1_GID_VALUE" "$path" 2>/dev/null; then
    return 0
  fi

  dir="$(dirname "$path")"
  base="$(basename "$path")"
  hg_docker run --rm --entrypoint /bin/sh -u 0:0 \
    -v "$dir":/target-dir \
    "$IMG" -c "chown -R $L1_UID_VALUE:$L1_GID_VALUE /target-dir/$base"
}

ensure_mode() {
  local mode="$1"
  local path="$2"
  local dir base

  if chmod "$mode" "$path" 2>/dev/null; then
    return 0
  fi

  dir="$(dirname "$path")"
  base="$(basename "$path")"
  hg_docker run --rm --entrypoint /bin/sh -u 0:0 \
    -v "$dir":/target-dir \
    "$IMG" -c "chmod $mode /target-dir/$base"
}

mkdir -p "$ROOT/data" "$ROOT/config" "$BOOTNODE_DIR" "$NODE1_DIR" "$NODE2_DIR"
ensure_owned "$BOOTNODE_DIR"
ensure_owned "$NODE1_DIR"
ensure_owned "$NODE2_DIR"
ensure_mode 775 "$BOOTNODE_DIR"
ensure_mode 775 "$NODE1_DIR"
ensure_mode 775 "$NODE2_DIR"

SECRETS_DIR="$(abspath "$SECRETS_DIR")"

echo "[init] Using image: $IMG"

if [ ! -f "$BOOTNODE_DIR/boot.key" ]; then
  if [ -f "$SECRETS_DIR/boot.key" ]; then
    echo "[init] Using Vault-rendered bootnode key from $SECRETS_DIR/boot.key"
    cp "$SECRETS_DIR/boot.key" "$BOOTNODE_DIR/boot.key"
    chmod 600 "$BOOTNODE_DIR/boot.key"
  else
    echo "[init] Generating bootnode key..."
    hg_docker run --rm -v "$BOOTNODE_DIR":/data "$IMG" bootnode -genkey /data/boot.key
  fi
fi
ensure_owned "$BOOTNODE_DIR/boot.key"
ensure_mode 600 "$BOOTNODE_DIR/boot.key"

echo "[init] Deriving bootnode enode..."
BOOT_ID="$(hg_docker run --rm -v "$BOOTNODE_DIR":/data "$IMG" bootnode --nodekey /data/boot.key --writeaddress)"
echo "enode://$BOOT_ID@$BOOTNODE_IP:$BOOTNODE_PORT" >"$BOOT_ENODE_FILE"
cp "$BOOT_ENODE_FILE" "$BOOT_ENODE_DATA_FILE"
ensure_owned "$BOOT_ENODE_FILE"
ensure_owned "$BOOT_ENODE_DATA_FILE"
ensure_mode 664 "$BOOT_ENODE_FILE"
ensure_mode 664 "$BOOT_ENODE_DATA_FILE"
echo "[init] Bootnode enode written to $BOOT_ENODE_FILE"

pick_key_dir() {
  # Prefer Vault-rendered keys if present; otherwise use local geth/keys.
  if [ -f "$SECRETS_DIR/node1.key" ] && [ -f "$SECRETS_DIR/node2.key" ]; then
    echo "$SECRETS_DIR"
    return 0
  fi
  if [ -f "$ROOT/geth/keys/node1.key" ] && [ -f "$ROOT/geth/keys/node2.key" ]; then
    echo "$ROOT/geth/keys"
    return 0
  fi

  echo "" # caller handles error messaging
}

KEYS_DIR="$(pick_key_dir)"
if [ -z "$KEYS_DIR" ]; then
  echo "[init] Missing signer keys for node1/node2." >&2
  echo "       Expected either:" >&2
  echo "         - Vault-rendered: $SECRETS_DIR/node1.key and $SECRETS_DIR/node2.key (run infra/vault/render-l1-secrets.sh)" >&2
  echo "         - Local dev:      $ROOT/geth/keys/node1.key and $ROOT/geth/keys/node2.key" >&2
  echo "       Example templates:" >&2
  echo "         - $ROOT/geth/keys/node1.key.example" >&2
  echo "         - $ROOT/geth/keys/node2.key.example" >&2
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  if [ -f "$SECRETS_DIR/password.txt" ]; then
    PASSWORD="$SECRETS_DIR/password.txt"
  else
    PASSWORD="$ROOT/geth/password.txt"
  fi
fi

PASSWORD="$(abspath "$PASSWORD")"

if [ ! -f "$PASSWORD" ]; then
  echo "[init] Missing geth account password file: $PASSWORD" >&2
  echo "       Create it locally (gitignored), or set L1_ACCOUNT_PASSWORD_FILE to an absolute path." >&2
  echo "       Example template: $ROOT/geth/password.txt.example" >&2
  exit 1
fi

init_node() {
  local name="$1"
  local dir="$2"
  local keyfile="$3"

  if [ -d "$dir/geth" ]; then
    echo "[init] $name already initialized, skipping."
    return
  fi

  echo "[init] Initializing $name..."
  hg_docker run --rm \
    -v "$dir":/data \
    -v "$ROOT/geth":/config:ro \
    -v "$KEYS_DIR":/keys:ro \
    -v "$PASSWORD":/password.txt:ro \
    "$IMG" sh -c "\
      mkdir -p /data/keystore && \
      geth account import --datadir /data --password /password.txt /keys/$keyfile >/dev/null && \
      geth init --datadir /data /config/genesis.json"
  ensure_owned "$dir"
}

init_node "node1" "$NODE1_DIR" "node1.key"
init_node "node2" "$NODE2_DIR" "node2.key"
ensure_owned "$NODE1_DIR"
ensure_owned "$NODE2_DIR"

echo "[init] Done. Datadirs are ready. Start the network with scripts/up.sh."
