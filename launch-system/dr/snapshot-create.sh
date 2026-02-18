#!/usr/bin/env bash
set -euo pipefail

: "${GHOSTSTACK_ENV:?set GHOSTSTACK_ENV=devnet|testnet|mainnet}"

DATA_ROOT="/data/${GHOSTSTACK_ENV}"
SNAP_ROOT="/opt/ghoststack/dr/snapshots/${GHOSTSTACK_ENV}"
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="${SNAP_ROOT}/data-${TS}.tar.gz"

sudo mkdir -p "${SNAP_ROOT}"
sudo tar -czf "${OUT}" -C "${DATA_ROOT}" .
sudo sha256sum "${OUT}" | sudo tee "${OUT}.sha256" >/dev/null
echo "${OUT}"

