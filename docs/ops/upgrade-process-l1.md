# L1 Upgrade Process

## Preconditions

- Change reviewed + approved by governance.
- Evidence pack prepared and hashed.
- Rollback plan verified.

## Steps

1) **Tag the release**
   ```bash
   infra/scripts/release-l1.sh --mode=staging --tag=l1-<version>
   ```
2) **Deploy to staging** and run smoke tests (script runs `bash infra/scripts/doctor-l1.sh`).
3) **Manual promotion** to production after staging sign-off.
4) **Monitor** metrics + logs for 30–60 minutes.

## Rollback

```bash
infra/scripts/rollback-l1.sh --mode=staging --tag=l1-<previous>
```

## Post-upgrade

- Refresh evidence pack.
- Update runbooks if operational behavior changed.
