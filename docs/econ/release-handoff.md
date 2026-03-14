# GhostStack Econ Engine — Release Handoff

Date: 2026-02-27
Branch: `release/testnet-audit`

## Scope delivered

- Sovereign econ contract module and Foundry validation suites.
- Off-chain execution loop services:
  - `hg-treasury-agent`
  - `hg-risk-oracle`
  - `hg-reporting-indexer`
  - `hg-proof-snapshotter`
- Devnet/Testnet/Mainnet compose overlays for econ stack.
- Econ observability assets (Prometheus rules + Grafana dashboard).
- Read-only econ operator UI routes and API proxy wiring.
- CI workflow and runtime policy/security gate scripts.

## Primary evidence documents

- Baseline and gap analysis: `docs/econ/baseline.md`
- Receipt format and runtime evidence: `docs/econ/execution-receipts.md`
- Production readiness checklist: `docs/econ/production-ready.md`
- Commit batching plan: `docs/econ/commit-split-plan.md`

## Validation status

### Contracts and policy gates

- Routing law suite: pass.
- Governance/risk suite: pass.
- Flywheel simulation suite: pass.
- Routing gate script: pass.
- Governance gate script: pass.
- No-secrets scan: pass.

### Service build and runtime

- `hg-*` service TypeScript builds: pass.
- Devnet compose startup: pass.
- Testnet compose startup: pass.
- API smoke across risk/treasury/indexer/snapshotter: pass.

## Runtime notes for operators

- Known non-blocker: monorepo compose may emit orphan container warnings; econ validation remains valid when `hg-*` services are healthy.
- Bootstrap behavior (testnet): snapshot responses can show `onchainPost.attempted=true` and `succeeded=false` with reason `onchain_post_not_implemented_in_bootstrap`; this is expected until on-chain post path is enabled.

## Recommended operator command order

1. `docker compose -f docker-compose.econ.devnet.yml up -d --build`
2. `bash scripts/econ/verify-routing-law.sh`
3. `bash scripts/econ/verify-governance-gate.sh`
4. `bash scripts/simulate-flywheel.sh`
5. `bash scripts/econ/no-secrets-scan.sh`
6. `docker compose -f docker-compose.econ.testnet.yml up -d --build`

## Final handoff

- Econ stack is implementation-complete for bootstrap/testnet execution with verified closed-loop service behavior.
- Mainnet deployment remains gated by `MainnetActivationGate` and environment-provided signing/gate parameters.