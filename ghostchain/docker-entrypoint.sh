#!/usr/bin/env bash
# docker-entrypoint.sh — GhostChain container entrypoint
set -euo pipefail

GHOST_HOME="${GHOST_HOME:-/root/.ghostchaind}"
CHAIN_ID="${CHAIN_ID:-ghostchain-1}"
MONIKER="${MONIKER:-ghostchain-validator}"

# Auto-initialise if no genesis exists
if [ ! -f "${GHOST_HOME}/config/genesis.json" ]; then
    echo "[ghostchain] Initialising chain at ${GHOST_HOME}..."
    ghostchaind init "${MONIKER}" --chain-id "${CHAIN_ID}" --home "${GHOST_HOME}"

    # Add a test validator key
    ghostchaind keys add validator --keyring-backend test --home "${GHOST_HOME}"

    # Pre-fund validator
    ghostchaind genesis add-genesis-account validator 1000000000ugst \
        --keyring-backend test --home "${GHOST_HOME}"

    # GenTx
    ghostchaind genesis gentx validator 100000000ugst \
        --chain-id "${CHAIN_ID}" --keyring-backend test --home "${GHOST_HOME}"

    ghostchaind genesis collect-gentxs --home "${GHOST_HOME}"
    echo "[ghostchain] Genesis initialised."
fi

case "$1" in
    start)
        exec ghostchaind start \
            --home "${GHOST_HOME}" \
            --minimum-gas-prices "0ugst" \
            --rpc.laddr tcp://0.0.0.0:26657 \
            --grpc.address 0.0.0.0:9090 \
            --api.address tcp://0.0.0.0:1317 \
            --api.enable true \
            --api.swagger true
        ;;
    *)
        exec ghostchaind "$@"
        ;;
esac
