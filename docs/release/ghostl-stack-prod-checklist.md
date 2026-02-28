# GhostL Stack Production Checklist

## Preflight

1. `npm ci`
2. `npm run security:deps`
3. `npm run verify:routing`
4. `npm run verify:governance`
5. `npm run build`
6. `npm run smoke:web:realm-login`
7. `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env config`
8. `npm run smoke:kong:auth -- .env`
9. `npm run e2e:smoke -- .env`

## Required artifacts

- `artifacts/deprecations.json`
- `artifacts/dependency-audit.json`
- `artifacts/dependency-outdated.json`
- `artifacts/dependency-exceptions-eval.json`
- `artifacts/gateway/e2e-kong-jwks-smoke.log`
- `artifacts/e2e/report.txt`

## Deployment gate

Deploy only when:

- dependency gates pass (or approved non-expired exceptions exist)
- routing/governance verification passes
- gateway JWKS smoke passes
- realm login smoke passes
- e2e smoke report is present
