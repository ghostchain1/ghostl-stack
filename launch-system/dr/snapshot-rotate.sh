#!/usr/bin/env bash
set -euo pipefail

: "${GHOSTSTACK_ENV:?set GHOSTSTACK_ENV=devnet|testnet|mainnet}"
: "${RETENTION:=7}"

SNAP_ROOT="/opt/ghoststack/dr/snapshots/${GHOSTSTACK_ENV}"
sudo mkdir -p "${SNAP_ROOT}"

mapfile -t snaps < <(sudo ls -1t "${SNAP_ROOT}"/data-*.tar.gz 2>/dev/null || true)
count="${#snaps[@]}"

if [ "${count}" -le "${RETENTION}" ]; then
  echo "ok retention=${RETENTION} current=${count}"
  exit 0
fi

for s in "${snaps[@]:${RETENTION}}"; do
  sudo rm -f "${s}" "${s}.sha256"
done

echo "rotated retention=${RETENTION} removed=$((count-RETENTION))"

