# L3 Disaster Recovery

## Scope
Recovery steps for Ghost L3 (OP Stack L3-on-L2) after data loss or unrecoverable service failure.

## Preconditions
- Parent L2 RPC reachable.
- Vault available (if `L3_SECRETS_SOURCE=vault`).
- L3 config snapshots preserved (`infra/opstack/l3/<name>/config`).

## Recovery steps

1) Stop L3 services
```bash
infra/scripts/opstack/down-l3.sh
```

2) Restore config + secrets
- Restore `infra/opstack/l3/<name>/config` from backups.
- Restore `infra/opstack/.env.l3` + `.env.secrets`.

3) Restore data dir (if available)
- Restore `infra/opstack/l3/<name>/data-<chainId>` if using snapshots.

4) Rebuild images if required
```bash
OPSTACK_IMAGE_TAG=local bash infra/scripts/opstack/build.sh
```

5) Restart L3
```bash
infra/scripts/opstack/up-l3.sh
```

6) Verify
```bash
infra/scripts/doctor-l3.sh
```

## Evidence capture
- Generate evidence pack post-recovery:
```bash
infra/scripts/evidence-pack-l3.sh
```
