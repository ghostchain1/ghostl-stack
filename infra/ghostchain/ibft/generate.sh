#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/networkFiles"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${REPO_ROOT}/scripts/lib/docker.sh"

# Clean any prior output with root permissions (previous runs create root-owned files).
hg_docker run --rm -v "$ROOT":/workspace alpine sh -c "rm -rf /workspace/networkFiles"

CHAIN_ID="${CHAIN_ID:-14000101}"
BLOCK_PERIOD="${BLOCK_PERIOD:-2}"
EPOCH_LENGTH="${EPOCH_LENGTH:-30000}"
GAS_LIMIT_HEX="${GAS_LIMIT_HEX:-0x1c9c380}"

CONFIG_JSON="$ROOT/config.generated.json"
cat >"$CONFIG_JSON" <<EOF
{
  "genesis": {
    "config": {
      "chainId": ${CHAIN_ID},
      "ibft2": {
        "blockperiodseconds": ${BLOCK_PERIOD},
        "epochlength": ${EPOCH_LENGTH},
        "requesttimeoutseconds": 10
      },
      "homesteadBlock": 0,
      "eip150Block": 0,
      "eip155Block": 0,
      "eip158Block": 0,
      "byzantiumBlock": 0,
      "constantinopleBlock": 0,
      "petersburgBlock": 0,
      "istanbulBlock": 0,
      "muirGlacierBlock": 0,
      "berlinBlock": 0,
      "londonBlock": 0,
      "arrowGlacierBlock": 0,
      "grayGlacierBlock": 0,
      "mergeNetsplitBlock": 0,
      "shanghaiTime": 0,
      "cancunTime": 0
    },
    "nonce": "0x0",
    "timestamp": "0x0",
    "gasLimit": "${GAS_LIMIT_HEX}",
    "difficulty": "0x1",
    "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "extraData": "",
    "baseFeePerGas": "0x3b9aca00",
    "alloc": {
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266": { "balance": "0x52b7d2dcc80cd2e4000000" },
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": { "balance": "0x52b7d2dcc80cd2e4000000" },
      "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": { "balance": "0x52b7d2dcc80cd2e4000000" },
      "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65": { "balance": "0x52b7d2dcc80cd2e4000000" }
    }
  },
  "blockchain": {
    "nodes": { "generate": true, "count": 4 }
  },
  "ibft2": {
    "validators": { "generate": true, "count": 4 }
  }
}
EOF

echo "Generating IBFT network files with chainId=${CHAIN_ID}, blockperiod=${BLOCK_PERIOD}s, gasLimit=${GAS_LIMIT_HEX} ..."
hg_docker run --rm \
  -v "$ROOT":/workspace \
  --entrypoint /bin/sh \
  hyperledger/besu:24.12.0 \
  -c "/opt/besu/bin/besu operator generate-blockchain-config \
    --config-file=/workspace/config.generated.json \
    --to=/workspace/networkFiles \
    --private-key-file-name=key \
    --genesis-file-name=genesis.json"

hg_docker run --rm -v "$ROOT":/workspace alpine sh -c "chown -R ${HOST_UID}:${HOST_GID} /workspace/networkFiles"

# Normalize key layout to node1..N and emit peers.txt for docker-compose.
KEYS_DIR="$OUT/keys"
rm -f "$OUT/peers.txt"
i=1
for dir in $(find "$KEYS_DIR" -mindepth 1 -maxdepth 1 -type d | sort); do
  target="$KEYS_DIR/node${i}"
  rm -rf "$target"
  mkdir -p "$target"
  cp "$dir/key" "$target/key"
  cp "$dir/key.pub" "$target/key.pub"
  pubkey="$(cat "$dir/key.pub")"
  pubkey="${pubkey#0x}" # besu enode expects hex without 0x
  ip_octet=$((10 + i))
  echo "enode://${pubkey}@172.28.0.${ip_octet}:30303" >>"$OUT/peers.txt"
  i=$((i + 1))
done

echo "Generated network files at $OUT"
