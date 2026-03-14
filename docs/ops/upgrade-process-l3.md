# L3 Upgrade Process

## Release
```bash
infra/scripts/release-l3.sh --tag=<tag> --mode=staging
```

## Rollback
```bash
infra/scripts/rollback-l3.sh --tag=<tag> --mode=staging
```

## Notes
- Ensure `infra/opstack/.env.l3.generated` is generated via `infra/scripts/env-sync-l3.sh`.
- Parent L2 must be healthy before upgrading L3.
- Evidence pack + SBOM are required for production releases.
