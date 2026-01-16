#!/bin/sh
set -e

DATADIR=/data
ENODE=${BOOTNODE_ENODE:-$(cat /run/bootnode-enode.txt)}
CHAIN_ID_VAL=${CHAIN_ID:-14000101}
SIGNER=${SIGNER_ADDRESS:-0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266}
HTTP_PORT=${HTTP_PORT:-8545}
WS_PORT=${WS_PORT:-8546}
AUTH_PORT=${AUTH_PORT:-8551}
P2P_PORT=${P2P_PORT:-30303}
METRICS_PORT=${METRICS_PORT:-6060}

if [ ! -d "$DATADIR/geth" ]; then
  echo "Datadir not initialized. Run scripts/init.sh first." >&2
  exit 1
fi

exec geth \
  --datadir "$DATADIR" \
  --networkid "$CHAIN_ID_VAL" \
  --syncmode=full \
  --gcmode=archive \
  --http --http.addr=0.0.0.0 --http.port="$HTTP_PORT" --http.api=eth,net,web3,debug,txpool,personal \
  --http.corsdomain="*" --http.vhosts="*" \
  --ws --ws.addr=0.0.0.0 --ws.port="$WS_PORT" --ws.origins="*" \
  --authrpc.addr=0.0.0.0 --authrpc.port="$AUTH_PORT" --authrpc.vhosts="*" \
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
