# Ghost Docker Control (Recreate + Rollback)

This directory contains guarded scripts to recreate containers without chain data loss and to rollback to a captured snapshot. The scripts do **not** delete volumes and never run `docker system prune`.

## Commands

```
./ops/docker/ghostctl-recreate.sh --rolling --mode prod --yes
./ops/docker/ghostctl-rollback.sh ./ops/docker/snapshots/<timestamp>
```

## Flags

- `--rolling`: Recreate services one-by-one (recommended).
- `--mode dev|prod`: Environment label for attestations.
- `--dry-run`: Perform checks and snapshot only.
- `--yes`: Skip confirmation prompt.
- `--no-rollback`: Disable auto-rollback on failure.

## Safety Guarantees

- Chain data volumes are preserved and fingerprinted before/after.
- Gas token address is verified across L1/L2/L3 configs.
- Rollback uses the snapshot compose files and restores container state without touching chain data.

## Required Tools

- `docker` + `docker compose`
- `python3`
- `openssl` (for signing) or `gpg` (optional)

## Attestation Keys

Set one of:

- `GHOST_ATTEST_PRIVATE_KEY=<path>` and optionally `GHOST_ATTEST_PUBLIC_KEY=<path>`
- `GHOST_ATTEST_GPG_KEY=<gpg-key-id>`

Without a signing key, the recreate script will abort.
