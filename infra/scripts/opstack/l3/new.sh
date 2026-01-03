#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: new.sh <l3-name> [--chain-id N] [--host-rpc-port P] [--settlement-rpc URL]" >&2
  exit 1
fi

CHAIN_ID=902
HOST_RPC_PORT=39545
ROLLUP_RPC_HOST_PORT=39546
BATCHER_RPC_HOST_PORT=39551
PROPOSER_RPC_HOST_PORT=39560
SETTLEMENT_RPC="http://l2-geth:8545"
L1_CHAIN_ID="${L2_CHAIN_ID:-901}"

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --chain-id)
      CHAIN_ID="$2"
      shift 2
      ;;
    --host-rpc-port)
      HOST_RPC_PORT="$2"
      shift 2
      ;;
    --settlement-rpc)
      SETTLEMENT_RPC="$2"
      shift 2
      ;;
    --l1-chain-id)
      L1_CHAIN_ID="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

DEST="$OP_DIR/l3/$NAME"
mkdir -p "$DEST/config" "$DEST/data" "$DEST/data/op-node"

if [ ! -f "$OP_DIR/config/jwt.txt" ]; then
  echo "missing $OP_DIR/config/jwt.txt (run opstack build/up first)" >&2
  exit 1
fi

cp "$OP_DIR/config/jwt.txt" "$DEST/config/jwt.txt"

export OP_DIR DEST CHAIN_ID L1_CHAIN_ID

# Rollup config: start from L2 template and tweak chain IDs / timestamps.
python - <<'PY'
import json, os, time, sys

src_rollup = os.path.join(os.environ["OP_DIR"], "config", "rollup.json")
dst_rollup = os.path.join(os.environ["DEST"], "config", "rollup.json")
chain_id = int(os.environ["CHAIN_ID"])
l1_chain_id = int(os.environ["L1_CHAIN_ID"])

with open(src_rollup) as f:
    data = json.load(f)

data["l1_chain_id"] = l1_chain_id
data["l2_chain_id"] = chain_id
data["genesis"]["l2_time"] = int(time.time())

with open(dst_rollup, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

# L1 chain config for this L3 (points at GhostL2 by default).
python - <<'PY'
import json, os

src_chain = os.path.join(os.environ["OP_DIR"], "config", "l1-chain.json")
dst_chain = os.path.join(os.environ["DEST"], "config", "l1-chain.json")
l1_chain_id = int(os.environ["L1_CHAIN_ID"])

with open(src_chain) as f:
    data = json.load(f)

data["config"]["chainId"] = l1_chain_id

with open(dst_chain, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

# Geth genesis: copy and bump chain ID + timestamp as a placeholder.
python - <<'PY'
import json, os, time

src_genesis = os.path.join(os.environ["OP_DIR"], "config", "genesis-l2.json")
dst_genesis = os.path.join(os.environ["DEST"], "config", "genesis.json")
chain_id = int(os.environ["CHAIN_ID"])

with open(src_genesis) as f:
    data = json.load(f)

data["config"]["chainId"] = chain_id
data["timestamp"] = hex(int(time.time()))

with open(dst_genesis, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

cat >"$DEST/.env" <<EOF
L3_NAME=$NAME
L3_CHAIN_ID=$CHAIN_ID
L3_HOST_RPC=$HOST_RPC_PORT
L3_L1_CHAIN_ID=$L1_CHAIN_ID
L3_L1_RPC=$SETTLEMENT_RPC
L3_ROLLUP_RPC_HOST_PORT=$ROLLUP_RPC_HOST_PORT
L3_BATCHER_HOST_PORT=$BATCHER_RPC_HOST_PORT
L3_PROPOSER_HOST_PORT=$PROPOSER_RPC_HOST_PORT
L3_METRICS_NODE_HOST_PORT=8300
L3_METRICS_BATCHER_HOST_PORT=8301
L3_METRICS_PROPOSER_HOST_PORT=8302
EOF

cat <<EOF
Created L3 scaffold: $DEST
- Config: $DEST/config/rollup.json and genesis.json (replace contract addresses before use)
- Env:     $DEST/.env

Run with:
  docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml \\
    --env-file infra/opstack/l3/$NAME/.env up -d l3-geth l3-op-node l3-op-batcher l3-op-proposer

Note: template uses placeholder contract addresses; update rollup.json/genesis.json once L3 contracts are deployed.
EOF
