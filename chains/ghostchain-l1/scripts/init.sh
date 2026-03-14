#!/bin/bash
# GhostGeth node initialiser
# Initialises the datadir from genesis.json if not already done.
set -euo pipefail

DATADIR="${DATADIR:-/data}"
GENESIS="${GENESIS:-/config/genesis.json}"
CHAIN_ID="${CHAIN_ID:-14000101}"
GCMODE="${GCMODE:-archive}"

if [ -d "$DATADIR/ghostgeth" ]; then
  echo "[ghostgeth-init] Datadir already initialised at $DATADIR — skipping."
  exit 0
fi

# Archive mode requires hash state scheme; full/snap use path (default).
STATE_SCHEME_FLAG=""
if [ "$GCMODE" = "archive" ]; then
  STATE_SCHEME_FLAG="--state.scheme=hash"
fi

echo "[ghostgeth-init] Initialising GhostChain L1 (chainId $CHAIN_ID, gcmode=$GCMODE) at $DATADIR"
ghostgeth init --datadir "$DATADIR" $STATE_SCHEME_FLAG "$GENESIS"
echo "[ghostgeth-init] Done."
