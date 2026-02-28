# Econ Commit Split Plan

Date: 2026-02-27
Branch: `release/testnet-audit`

This plan assumes econ-only files are already staged and should be committed in focused batches.

## Commit 1 — Contracts and invariants

Paths:

- `contracts/src/econ/GhostEconomicEngine.sol`
- `contracts/test/foundry/GhostEconomicRouting.t.sol`
- `contracts/test/foundry/GhostEconomicGovernanceRisk.t.sol`
- `contracts/test/foundry/GhostEconomicFlywheel.t.sol`

Suggested message:

- `feat(econ-contracts): add sovereign routing, governance gate, risk and flywheel tests`

## Commit 2 — Econ services runtime

Paths:

- `services/hg-treasury-agent/**`
- `services/hg-risk-oracle/**`
- `services/hg-reporting-indexer/**`
- `services/hg-proof-snapshotter/**`

Suggested message:

- `feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter`

## Commit 3 — Deployment overlays and observability

Paths:

- `docker-compose.econ.devnet.yml`
- `docker-compose.econ.testnet.yml`
- `docker-compose.econ.mainnet.yml`
- `observability/prometheus/prometheus-econ.yml`
- `observability/prometheus/rules/econ-engine.rules.yml`
- `observability/grafana/dashboards/econ-engine-overview.json`

Suggested message:

- `feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability`

## Commit 4 — UI and API proxy

Paths:

- `apps/web/app/econ/**`
- `apps/web/app/api/econ/[...path]/route.ts`
- `apps/web/src/lib/econ-api.ts`

Suggested message:

- `feat(econ-ui): add control center routes and econ API proxy`

## Commit 5 — Gates, CI, and scripts

Paths:

- `.github/workflows/econ-engine.yml`
- `scripts/econ/**`
- `scripts/simulate-flywheel.sh`
- `package.json`

Suggested message:

- `ci(econ): add routing/governance/secret gates and econ workflow/scripts`

## Commit 6 — Docs and handoff

Paths:

- `docs/econ/baseline.md`
- `docs/econ/execution-receipts.md`
- `docs/econ/no-secrets-proof.md`
- `docs/econ/production-ready.md`
- `docs/econ/release-handoff.md`
- `docs/econ/commit-split-plan.md`

Suggested message:

- `docs(econ): add baseline, receipts, production checklist and release handoff`

## Optional command sequence

```bash
# verify staged set
git diff --cached --name-only

# commit by batch using interactive add/reset if needed
git reset
git add contracts/src/econ contracts/test/foundry/GhostEconomic*.t.sol
git commit -m "feat(econ-contracts): add sovereign routing, governance gate, risk and flywheel tests"

git add services/hg-treasury-agent services/hg-risk-oracle services/hg-reporting-indexer services/hg-proof-snapshotter
git commit -m "feat(econ-services): add treasury agent, risk oracle, reporting indexer and snapshotter"

git add docker-compose.econ.devnet.yml docker-compose.econ.testnet.yml docker-compose.econ.mainnet.yml observability/prometheus/prometheus-econ.yml observability/prometheus/rules/econ-engine.rules.yml observability/grafana/dashboards/econ-engine-overview.json
git commit -m "feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability"

git add apps/web/app/econ apps/web/app/api/econ/[...path]/route.ts apps/web/src/lib/econ-api.ts
git commit -m "feat(econ-ui): add control center routes and econ API proxy"

git add .github/workflows/econ-engine.yml scripts/econ scripts/simulate-flywheel.sh package.json
git commit -m "ci(econ): add routing/governance/secret gates and econ workflow/scripts"

git add docs/econ
git commit -m "docs(econ): add baseline, receipts, production checklist and release handoff"
```