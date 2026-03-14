# Production Release Gate (Minimal)

Use this as the final pre-deploy gate for app runtime readiness.

## Required env

```bash
export GHOSTWALLET_MASTER_KEY=<32-byte-hex-or-base64>
```

## Single gate command

```bash
npm run verify:prod
```

CI enforcement:

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Required check/job: `app-runtime-release-gate`

## Pass criteria

- Build succeeds (`apps/api` + `apps/web`).
- Smoke succeeds (`api`, `worker`, `web` all return HTTP `200`).
- Command exits with status `0`.

## Failure policy

- Stop release.
- Fix issue.
- Re-run `npm run verify:prod` until green.
