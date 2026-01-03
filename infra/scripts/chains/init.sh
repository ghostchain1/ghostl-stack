#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
# Pin to a released build; `latest` drifts and can break existing chain data.
IMAGE="0xpolygon/polygon-edge:1.3.2"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd docker
need_cmd jq

fix_perms() {
  local data_dir="$1"
  # polygon-edge runs as user "edge" (uid=100 gid=101) by default. Newer
  # versions error if the data-dir was created by a different group.
  # Keep ownership aligned to edge:edge, but make files world-readable/writable
  # for local dev ergonomics.
  sudo chown -R 100:101 "$data_dir" >/dev/null 2>&1 || true
  sudo chmod -R a+rwX "$data_dir" >/dev/null 2>&1 || true
  sudo find "$data_dir" -type d -exec chmod 777 {} + >/dev/null 2>&1 || true
  sudo find "$data_dir" -type f -exec chmod 666 {} + >/dev/null 2>&1 || true

  docker run --rm --user 0:0 --entrypoint /bin/sh -v "$data_dir:/data" "$IMAGE" -lc "
    set -e
    chown -R 100:101 /data || true
    find /data -type d -exec chmod 777 {} +
    find /data -type f -exec chmod 666 {} +
  " >/dev/null 2>&1 || true
}

init_chain() {
  local chain="$1"
  local cfg="$ROOT_DIR/chains/$chain/chain.json"
  local data="$ROOT_DIR/chains/$chain/data"

  if [ ! -f "$cfg" ]; then
    echo "Missing config: $cfg" >&2
    exit 1
  fi

  mkdir -p "$data"
  # polygon-edge image defaults to a non-root "edge" user. Ensure bind-mounted
  # dirs are writable regardless of host uid/gid.
  sudo chmod 777 "$data" >/dev/null 2>&1 || true
  fix_perms "$data"

  local name chain_id premine_addr premine_amt gas_limit boot_ip libp2p grpc jsonrpc
  name="$(jq -r '.name' "$cfg")"
  chain_id="$(jq -r '.chainId' "$cfg")"
  premine_addr="$(jq -r '.premine.address' "$cfg")"
  premine_amt="$(jq -r '.premine.amountWei' "$cfg")"
  gas_limit="$(jq -r '.blockGasLimit' "$cfg")"
  boot_ip="$(jq -r '.bootnodeIp' "$cfg")"
  libp2p="$(jq -r '.libp2pPort' "$cfg")"
  grpc="$(jq -r '.grpcPort' "$cfg")"
  jsonrpc="$(jq -r '.jsonrpcPort' "$cfg")"

  if [ ! -f "$data/genesis.json" ]; then
    echo "[$chain] generating genesis + validator secrets..."

    if [ ! -f "$data/validator-1/consensus/validator.key" ]; then
      mkdir -p "$data/validator-1"
      docker run --rm -v "$data:/data" "$IMAGE" \
        secrets init --insecure --data-dir /data/validator-1 >/dev/null
    fi
    fix_perms "$data"

    local node_id
    node_id="$(
      docker run --rm -v "$data:/data" "$IMAGE" \
        secrets output --data-dir /data/validator-1 --node-id | tail -n 1 | tr -d '\r\n'
    )"

    docker run --rm -v "$data:/data" "$IMAGE" \
      genesis \
      --dir /data \
      --name "$name" \
      --chain-id "$chain_id" \
      --premine "$premine_addr:$premine_amt" \
      --bootnode "/ip4/$boot_ip/tcp/$libp2p/p2p/$node_id" \
      --consensus ibft \
      --validators-path /data \
      --validators-prefix validator- \
      --block-gas-limit "$gas_limit" >/dev/null
    fix_perms "$data"

    echo "[$chain] wrote $data/genesis.json"
  else
    if [ ! -f "$data/validator-1/consensus/validator.key" ]; then
      echo "[$chain] genesis exists but validator key is missing; run: bash infra/scripts/chains/reset.sh" >&2
      exit 1
    fi
    fix_perms "$data"
    echo "[$chain] already initialized"
  fi

  echo "[$chain] RPC=http://localhost:$jsonrpc (container jsonrpc :$jsonrpc, grpc :$grpc, libp2p :$libp2p)"
}

target="${1:-all}"
case "$target" in
  all)
    init_chain l2
    init_chain l3
    ;;
  l2)
    init_chain l2
    ;;
  l3)
    init_chain l3
    ;;
  *)
    echo "Usage: bash infra/scripts/chains/init.sh [all|l2|l3]" >&2
    exit 1
    ;;
esac
