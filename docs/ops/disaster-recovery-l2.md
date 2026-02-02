# L2 Disaster Recovery

## Scope
Recovery steps for Ghost L2 (OP Stack) after data loss or unrecoverable service failure.

## Preconditions
- L1 RPC reachable.
- Vault available (if `L2_SECRETS_SOURCE=vault`).
- Config snapshots preserved (`infra/opstack/config`).

## Recovery steps

1) Stop L2 services
```bash
infra/scripts/opstack/down-l2.sh
```

2) Restore config + secrets
- Restore `infra/opstack/config` from backups.
- Restore `infra/opstack/.env` + `.env.secrets`.

3) Restore data dir (if available)
- Restore `infra/opstack/data/l2-geth-<chainId>` if using snapshots.

4) Rebuild images if required
```bash
OPSTACK_IMAGE_TAG=local bash infra/scripts/opstack/build.sh
```

5) Restart L2
```bash
infra/scripts/opstack/up-l2.sh
```

6) Verify
```bash
infra/scripts/doctor-l2.sh
```

## Evidence capture
- Generate evidence pack post-recovery:
```bash
infra/scripts/evidence-pack-l2.sh
```
