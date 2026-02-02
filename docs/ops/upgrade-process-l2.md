# L2 Upgrade Process

## Release
```bash
infra/scripts/release-l2.sh --tag=<tag> --mode=staging
```

## Rollback
```bash
infra/scripts/rollback-l2.sh --tag=<tag> --mode=staging
```

## Notes
- Ensure `infra/opstack/.env` is generated via `infra/scripts/env-sync-l2.sh`.
- L1 must be healthy before upgrading L2.
- Evidence pack + SBOM are required for production releases.
