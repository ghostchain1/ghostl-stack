# L1 Disaster Recovery

## Objectives

- Restore L1 RPC + consensus within the agreed RTO/RPO.
- Preserve chain data integrity and validator keys.

## Backups

- Snapshot `infra/ghostchain/data` on a scheduled cadence.
- Store snapshot metadata + hashes in `infra/evidence/`.

## Recovery steps

1) **Quarantine** compromised nodes.
2) **Restore** from last known-good snapshot:
   - Stop services: `infra/ghostchain/scripts/down.sh`
   - Replace data directory with snapshot.
3) **Rehydrate** secrets from Vault (never from git).
4) **Start**: `infra/ghostchain/scripts/up.sh`
5) **Verify**: `infra/scripts/doctor-l1.sh`

## Post-incident

- Generate evidence pack: `infra/scripts/evidence-pack-l1.sh`.
- File a governance report with evidence hashes.
