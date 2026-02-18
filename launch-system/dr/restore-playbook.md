# Disaster Recovery Playbook

This is a VM-local DR mechanism for GhostStack data directories.

## Snapshot create

```bash
sudo GHOSTSTACK_ENV=testnet /opt/ghoststack/dr/snapshot-create.sh
```

## Snapshot rotate

```bash
sudo GHOSTSTACK_ENV=testnet RETENTION=7 /opt/ghoststack/dr/snapshot-rotate.sh
```

## Export to backup host

```bash
sudo GHOSTSTACK_ENV=testnet BACKUP_SSH_TARGET=user@backup-host BACKUP_DEST_DIR=/backups/ghoststack /opt/ghoststack/dr/backup-export.sh
```

## Restore (manual)

1) Stop services for the environment (compose down).
2) Pick a snapshot tarball from `/opt/ghoststack/dr/snapshots/<env>/`.
3) Validate checksum (`sha256sum -c`).
4) Extract into `/data/<env>/` (overwriting current data only if intended).

