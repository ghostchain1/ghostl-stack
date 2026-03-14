#!/bin/bash
# GhostGeth node runner
# Runs ghostgeth after ensuring the datadir is initialised.
set -euo pipefail

DATADIR="${DATADIR:-/data}"
GENESIS="${GENESIS:-/config/genesis.json}"

CHAIN_ID="${CHAIN_ID:-14000101}"
SIGNER="${SIGNER_ADDRESS:-}"
HTTP_PORT="${HTTP_PORT:-8545}"
WS_PORT="${WS_PORT:-8546}"
AUTH_PORT="${AUTH_PORT:-8551}"
P2P_PORT="${P2P_PORT:-30303}"
METRICS_PORT="${METRICS_PORT:-6060}"

HTTP_APIS="${HTTP_APIS:-eth,net,web3,debug,txpool}"
WS_APIS="${WS_APIS:-eth,net,web3}"

# CORS — allow GhostChain frontend domains by default
HTTP_CORS="${HTTP_CORS:-https://rpc.ghostchain.cloud,https://app.ghostchain.cloud,https://ghostchain.cloud,http://localhost}"
WS_ORIGINS="${WS_ORIGINS:-https://rpc.ghostchain.cloud,https://app.ghostchain.cloud,https://ghostchain.cloud,http://localhost}"
HTTP_VHOSTS="${HTTP_VHOSTS:-rpc.ghostchain.cloud,localhost,127.0.0.1}"
AUTHRPC_VHOSTS="${AUTHRPC_VHOSTS:-localhost,127.0.0.1}"

AUTH_JWT_FILE="${AUTH_JWT_FILE:-}"
SYNCMODE="${SYNCMODE:-full}"
GCMODE="${GCMODE:-archive}"
VERBOSITY="${VERBOSITY:-3}"
EXTRA_FLAGS="${EXTRA_FLAGS:-}"

# Archive mode requires hash state scheme; full/snap use path (go-ethereum default).
STATE_SCHEME=""
if [ "$GCMODE" = "archive" ]; then
  STATE_SCHEME="--state.scheme=hash"
fi

# Resolve bootnodes
BOOTNODES=""
if [ -n "${BOOTNODE_ENODE:-}" ]; then
  BOOTNODES="$BOOTNODE_ENODE"
elif [ -f /run/bootnode-enode.txt ]; then
  BOOTNODES="$(cat /run/bootnode-enode.txt)"
elif [ -f /run/bootnode/bootnode-enode.txt ]; then
  BOOTNODES="$(cat /run/bootnode/bootnode-enode.txt)"
else
  echo "[ghostgeth] WARNING: No bootnode enode found — node may not peer." >&2
fi

# Auto-init if needed
if [ ! -d "$DATADIR/geth" ]; then
  echo "[ghostgeth] Datadir not found — running init..."
  ghostgeth-init
fi

echo "[ghostgeth] Starting GhostGeth — GhostChain L1 (chainId $CHAIN_ID)"
echo "[ghostgeth]   HTTP RPC : 0.0.0.0:$HTTP_PORT"
echo "[ghostgeth]   WS RPC   : 0.0.0.0:$WS_PORT"
echo "[ghostgeth]   P2P      : 0.0.0.0:$P2P_PORT"
[ -n "$BOOTNODES" ] && echo "[ghostgeth]   Bootnodes: $BOOTNODES"

exec ghostgeth \
  --datadir "$DATADIR" \
  --networkid "$CHAIN_ID" \
  --syncmode="$SYNCMODE" \
  --gcmode="$GCMODE" \
  $STATE_SCHEME \
  --http \
  --http.addr=0.0.0.0 \
  --http.port="$HTTP_PORT" \
  --http.api="$HTTP_APIS" \
  --http.corsdomain="$HTTP_CORS" \
  --http.vhosts="$HTTP_VHOSTS" \
  --ws \
  --ws.addr=0.0.0.0 \
  --ws.port="$WS_PORT" \
  --ws.origins="$WS_ORIGINS" \
  --ws.api="$WS_APIS" \
  --authrpc.addr=0.0.0.0 \
  --authrpc.port="$AUTH_PORT" \
  --authrpc.vhosts="$AUTHRPC_VHOSTS" \
  ${AUTH_JWT_FILE:+--authrpc.jwtsecret="$AUTH_JWT_FILE"} \
  --ipcdisable \
  ${BOOTNODES:+--bootnodes "$BOOTNODES"} \
  --port "$P2P_PORT" \
  ${SIGNER:+--mine} \
  ${SIGNER:+--miner.etherbase="$SIGNER"} \
  ${SIGNER:+--unlock "$SIGNER"} \
  ${SIGNER:+--password /config/password.txt} \
  ${SIGNER:+--allow-insecure-unlock} \
  --metrics \
  --metrics.addr=0.0.0.0 \
  --metrics.port="$METRICS_PORT" \
  --verbosity="$VERBOSITY" \
  $EXTRA_FLAGS
