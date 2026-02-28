# Sovereign Engine Runbook

## Scope

Operational runbook for the sovereign economic loop:

`L3 fee capture -> L2 aggregation -> L1 treasury -> yield deployment -> redistribution`

## Services

- `l3-fee-collector` (`:7681`)
- `l2-revenue-aggregator` (`:7682`)
- `treasury-engine` (`:7683`)
- `reward-distributor` (`:7684`)

## Start / Stop

- Start full sovereign stack: `docker compose -f docker-compose.sovereign.yml up -d --build`
- Stop stack: `docker compose -f docker-compose.sovereign.yml down --remove-orphans`
- Integrated boot path: `./tools/ghostctl up devnet`

## Health + Metrics

- Health checks:
  - `curl -fsS http://localhost:7681/health`
  - `curl -fsS http://localhost:7682/health`
  - `curl -fsS http://localhost:7683/health`
  - `curl -fsS http://localhost:7684/health`
- Metrics:
  - `curl -fsS http://localhost:7681/metrics`
  - `curl -fsS http://localhost:7682/metrics`
  - `curl -fsS http://localhost:7683/metrics`
  - `curl -fsS http://localhost:7684/metrics`

## Routing Law Verification

- Run global routing gate: `bash scripts/verify-routing.sh`
- Sovereign assumptions enforced in runtime code:
  - L3 events accepted only when target is L2
  - L2 batches forward only to L1 treasury
  - Treasury service refuses startup unless configured as L1 layer

## Governance Gate Verification

- Validate proposal approval file: `bash scripts/verify-governance.sh --proposal-id <id>`
- Capital deployment + reward cycle endpoints require:
  - `approval.json` exists
  - `allowDeploy=true`
  - `quorumReached=true`
  - `timelockExpiresAt` in the past

## Smoke Test

Run end-to-end smoke sequence:

`bash scripts/smoke/sovereign-economy.sh`

This verifies:

- L3 fee ingest
- L2 batching + flush
- L1 treasury intake
- Governance-gated allocation execution
- Timelocked reward cycle queue + execute

## Incident Response

1. Freeze treasury capital deployment:
   - `POST /v1/treasury/failsafe` with `{"emergencyHalt":true,"governanceProposalId":"<id>"}`
2. Pause reward execution:
   - `POST /v1/reward/failsafe` with `{"distributionPaused":true,"governanceProposalId":"<id>"}`
3. Confirm flags:
   - `GET /v1/treasury/status`
   - `GET /health` on reward distributor
4. Preserve evidence:
   - `GET /v1/treasury/proof`
   - save outputs under `docs/evidence/`

## Rollback

1. Stop sovereign compose stack:
   - `docker compose -f docker-compose.sovereign.yml down --remove-orphans`
2. Revert to prior deployment image tags.
3. Restore SQLite data from snapshot volumes if needed.
4. Re-run:
   - `bash scripts/verify-routing.sh`
   - `bash scripts/verify-governance.sh --proposal-id <id>`
   - `bash scripts/smoke/sovereign-economy.sh`
