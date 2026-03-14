# Ghost Compliance Stack

Production-grade compliance engine for GhostChain (L1) and GhostL2/L3 (OP Stack).

## Quick start

```bash
docker compose up --build
```

The stack boots:
- Compliance API: http://localhost:8090
- Compliance UI: http://localhost:3201
- Postgres: localhost:5432
- Redis: localhost:6379

Optional observability:

```bash
docker compose --profile observability up --build
```

Prometheus: http://localhost:9090
Grafana: http://localhost:3001 (admin / ghost)

## Services

- `services/ghost-compliance`: Fastify API, policy engine, audit + evidence.
- `services/ghost-compliance-worker`: prediction worker.
- `apps/web`: Next.js dashboard (compliance console under `/compliance/*`).
- `contracts/compliance`: Compliance oracle + guard contracts.

## Environment

Copy `.env.example` values into service `.env` files as needed.

Key variables:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ATTESTATION_PRIVATE_KEY` (secp256k1 hex, used for ECDSA attestations)
- `NEXT_PUBLIC_COMPLIANCE_URL`
- `COMPLIANCE_ANALYST_JWT` (server-side token for audit endpoints)
- `COMPLIANCE_ADMIN_JWT` (admin token for policy/law ingestion)

## Security scanning note (CI vs local)

- CI secret scans run on repository checkout and should not include developer-local `.env` files.
- Local scans may flag valid dev tokens/JWTs in `.env` or `.env.local`; treat these as local-environment findings unless those files are tracked.
- To run a CI-like local secret scan:

```bash
trivy fs --timeout 10m --scanners secret --secret-config trivy-secret.yaml --exit-code 1 \
	--skip-dirs node_modules,contracts/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,contracts/typechain-types,contracts/proposals \
	--skip-files .env,.env.local,ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json \
	.
```

## Migrations + seed

The docker compose stack runs the one-shot `ghost-compliance-migrate` service on boot.
To run manually:

```bash
cd services/ghost-compliance
npm run migrate
```

## Contracts

See `contracts/compliance/README.md` for deploy and test steps.

## Tests

API and evaluator tests:

```bash
cd services/ghost-compliance
npm run test
```

UI e2e tests:

```bash
cd apps/web
PLAYWRIGHT_BASE_URL=http://localhost:3201 npm run test:e2e
```

## Runbook

- If `/v1/decision` returns `policy_bundle_missing`, ensure policies are seeded and active.
- If UI shows empty tables, check API health at `http://localhost:8090/health`.
- If JWT errors occur, confirm `JWT_SECRET` and role claims.
- If attestations fail on-chain, verify the signer address in `ComplianceOracle`.
