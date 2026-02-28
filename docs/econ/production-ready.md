# GhostStack Econ Engine — Production Ready Checklist (PHASE 7)

Verified on: 2026-02-27

## Build and test proofs

- Routing law tests:
  - `cd contracts && forge test --match-path test/foundry/GhostEconomicRouting.t.sol`
- Governance + risk tests:
  - `cd contracts && forge test --match-path test/foundry/GhostEconomicGovernanceRisk.t.sol`
- Flywheel simulation:
  - `bash scripts/simulate-flywheel.sh`

Observed result: all suites passed.

- Routing suite: `5 passed; 0 failed`
- Governance/risk suite: `4 passed; 0 failed`
- Flywheel suite: `2 passed; 0 failed`

## Security proofs

- Secret scan:
  - `bash scripts/econ/no-secrets-scan.sh`
- Trivy scan (CI):
  - `.github/workflows/econ-engine.yml` job `trivy`

Observed result:

- `bash scripts/econ/no-secrets-scan.sh` => `PASS` (Trivy secret scan in fallback mode).
- Trivy vulnerability scan remains enforced in CI workflow `.github/workflows/econ-engine.yml`.

## Routing law proofs

- Contract-level strict reverts in:
  - `L3FeeRouter`
  - `L2FeeRouter`
  - `L1TreasuryReceiver`
- Bypass tests in:
  - `contracts/test/foundry/GhostEconomicRouting.t.sol`

## Governance gate proof

- Mainnet activation contract:
  - `MainnetActivationGate`
- Mainnet execution refusal path:
  - `hg-treasury-agent` rejects when gate not active
- Test:
  - `testSchedulerBlockedWhenMainnetGateClosed`

## End-to-end flywheel proof

- Test:
  - `testFlywheelEndToEnd`
- Demonstrates:
  - L3 capture -> L2 aggregation -> L1 receive
  - L1 allocation -> mock external yield -> yield return
  - L1 distribution and flow oracle counters

## Compose deployment proof commands

- Devnet:
  - `docker compose -f docker-compose.econ.devnet.yml up -d --build`
- Testnet:
  - `docker compose -f docker-compose.econ.testnet.yml up -d --build`
- Mainnet (gated):
  - `MAINNET_GATE_RPC=... MAINNET_GATE_ADDRESS=... RECEIPT_SIGNING_SECRET=... SNAPSHOT_SIGNING_SECRET=... docker compose -f docker-compose.econ.mainnet.yml up -d --build`

Compose manifest validation executed:

- `docker compose -f docker-compose.econ.devnet.yml config` => `DEVNET_CONFIG_OK`
- `docker compose -f docker-compose.econ.testnet.yml config` => `TESTNET_CONFIG_OK`
- `docker compose -f docker-compose.econ.mainnet.yml config` (with required placeholder envs) => `MAINNET_CONFIG_OK`

## Hardening delta (this run)

- Baseline report corrected to reflect actual existing econ modules: `docs/econ/baseline.md`.
- Runtime signing secret enforcement hardened in:
  - `services/hg-treasury-agent/src/index.ts`
  - `services/hg-risk-oracle/src/index.ts`
  - `services/hg-proof-snapshotter/src/index.ts`
- Compose security hardening extended with explicit network segmentation and resource constraints in:
  - `docker-compose.econ.devnet.yml`
  - `docker-compose.econ.testnet.yml`
  - `docker-compose.econ.mainnet.yml`

## Rollback

- Use existing rollback practices in:
  - `docs/runbooks/rollback.md`
- For econ services, scale down in reverse dependency order:
  - proof-snapshotter -> treasury-agent -> risk-oracle -> reporting-indexer
- If contract-level issue is confirmed, execute governance pause actions first.

## Evidence paths

- Baseline: `docs/econ/baseline.md`
- Receipt format: `docs/econ/execution-receipts.md`
- This checklist: `docs/econ/production-ready.md`
- Release handoff: `docs/econ/release-handoff.md`
- No-secrets proof: `docs/econ/no-secrets-proof.md`

## Known non-blockers (validated)

- Orphan container warnings from `docker compose` in this monorepo context are informational and do not block econ stack health or API smoke checks.
- In testnet bootstrap mode, snapshot responses may report:
  - `onchainPost.enabled=true`
  - `onchainPost.attempted=true`
  - `onchainPost.succeeded=false`
  - `onchainPost.reason=onchain_post_not_implemented_in_bootstrap`
  This is expected until on-chain posting implementation is enabled for the target environment.
