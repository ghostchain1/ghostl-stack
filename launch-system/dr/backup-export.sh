#!/usr/bin/env bash
set -euo pipefail

: "${GHOSTSTACK_ENV:?set GHOSTSTACK_ENV=devnet|testnet|mainnet}"
: "${BACKUP_SSH_TARGET:?set BACKUP_SSH_TARGET=user@backup-host}"
: "${BACKUP_DEST_DIR:?set BACKUP_DEST_DIR=/backups/ghoststack}"

SNAP_ROOT="/opt/ghoststack/dr/snapshots/${GHOSTSTACK_ENV}"
sudo mkdir -p "${SNAP_ROOT}"

rsync -a "${SNAP_ROOT}/" "${BACKUP_SSH_TARGET}:${BACKUP_DEST_DIR}/${GHOSTSTACK_ENV}/"
echo "exported ${GHOSTSTACK_ENV}"

