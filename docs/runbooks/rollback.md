# Runbook: Rollback

## Trigger conditions

- dependency gate regression after deploy
- gateway auth rejects valid realm tokens
- unexpected 401/403 spikes on protected routes

## Rollback steps

1. Capture logs and artifacts:

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env logs --no-color > /tmp/ghostl-prod-rollback.log
```

2. Roll back application images/commit to last known-good release tag.
3. Recreate stack:

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env down
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d
```

4. Run validation suite:

```bash
npm run verify:routing
npm run verify:governance
npm run smoke:kong:auth -- .env
npm run smoke:web:realm-login
```

5. Record incident and update dependency exception owner notes if rollback was security-related.

## Econ engine rollback extension

When `hg-*` services or economic contracts are implicated:

1. Stop econ overlay services first:

```bash
docker compose -f docker-compose.econ.mainnet.yml down
```

2. Re-run governance and routing gates before restart:

```bash
bash scripts/econ/verify-routing-law.sh
bash scripts/econ/verify-governance-gate.sh
```

3. Bring back lowest-risk read path first:

```bash
docker compose -f docker-compose.econ.devnet.yml up -d hg-reporting-indexer hg-proof-snapshotter
```

4. Re-enable execution path (`hg-treasury-agent`) only after:
- Mainnet activation gate verified on-chain.
- Latest secret scan and alert checks pass.
