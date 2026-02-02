#!/bin/sh
set -e

DATADIR=/data
if [ -n "${BOOTNODE_ENODE:-}" ]; then
  ENODE="$BOOTNODE_ENODE"
elif [ -f /run/bootnode-enode.txt ]; then
  ENODE="$(cat /run/bootnode-enode.txt)"
elif [ -f /run/bootnode/bootnode-enode.txt ]; then
  ENODE="$(cat /run/bootnode/bootnode-enode.txt)"
else
  echo "Bootnode enode file not found." >&2
  exit 1
fi
CHAIN_ID_VAL=${CHAIN_ID:-14000101}
SIGNER=${SIGNER_ADDRESS:-0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266}
HTTP_PORT=${HTTP_PORT:-8545}
WS_PORT=${WS_PORT:-8546}
AUTH_PORT=${AUTH_PORT:-8551}
P2P_PORT=${P2P_PORT:-30303}
METRICS_PORT=${METRICS_PORT:-6060}
AUTH_JWT_FILE=${AUTH_JWT_FILE:-}
HTTP_APIS=${HTTP_APIS:-eth,net,web3,debug,txpool}
WS_APIS=${WS_APIS:-eth,net,web3}
HTTP_VHOSTS=${HTTP_VHOSTS:-localhost,127.0.0.1}
HTTP_CORS=${HTTP_CORS:-http://localhost,http://127.0.0.1}
WS_ORIGINS=${WS_ORIGINS:-http://localhost,http://127.0.0.1}
AUTHRPC_VHOSTS=${AUTHRPC_VHOSTS:-localhost,127.0.0.1}

if [ ! -d "$DATADIR/geth" ]; then
  echo "Datadir not initialized. Run scripts/init.sh first." >&2
  exit 1
fi

exec geth \
  --datadir "$DATADIR" \
  --networkid "$CHAIN_ID_VAL" \
  --syncmode=full \
  --gcmode=archive \
  --http --http.addr=0.0.0.0 --http.port="$HTTP_PORT" --http.api="$HTTP_APIS" \
  --http.corsdomain="$HTTP_CORS" --http.vhosts="$HTTP_VHOSTS" \
  --ws --ws.addr=0.0.0.0 --ws.port="$WS_PORT" --ws.origins="$WS_ORIGINS" --ws.api="$WS_APIS" \
  --authrpc.addr=0.0.0.0 --authrpc.port="$AUTH_PORT" --authrpc.vhosts="$AUTHRPC_VHOSTS" \
  ${AUTH_JWT_FILE:+--authrpc.jwtsecret="$AUTH_JWT_FILE"} \
  --ipcdisable \
  --bootnodes "$ENODE" \
  --port "$P2P_PORT" \
  --mine \
  --miner.etherbase="$SIGNER" \
  --unlock "$SIGNER" \
  --password /config/password.txt \
  --allow-insecure-unlock \
  --metrics --metrics.addr=0.0.0.0 --metrics.port="$METRICS_PORT" \
  --verbosity=3
