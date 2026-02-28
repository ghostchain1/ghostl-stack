# GhostStack Closed-Loop Sovereign Economic Engine — Baseline Report (PHASE 0)

Date: 2026-02-27
Scope root: `/home/ghost/ghostl-stack`
Assumption mode: best-effort/no-interruption bootstrap (no external secrets generated, no destructive operations)

## 1) What exists today

### Contracts (implemented in econ module)
- Foundry + Hardhat mixed toolchain is present in `contracts/`.
- Requested economic engine contracts are implemented in `contracts/src/econ/GhostEconomicEngine.sol`:
   - `L3FeeRouter`, `L2FeeRouter`, `L1TreasuryReceiver`
   - `TreasuryVault`, `TreasuryGovernor`, `RiskPolicyRegistry`, `DistributionModule`
   - `YieldStrategyRegistry`, `AllocationScheduler`, `MockExternalYield`
   - `TreasurySnapshot`, `SupplyAndFlowOracle`, `MainnetActivationGate`

### Contract tests/invariants
- Foundry suites exist for requested invariants and flow simulation:
   - `contracts/test/foundry/GhostEconomicRouting.t.sol`
   - `contracts/test/foundry/GhostEconomicGovernanceRisk.t.sol`
   - `contracts/test/foundry/GhostEconomicFlywheel.t.sol`

### Off-chain services
- Requested services exist as separate Dockerized TypeScript modules:
   - `services/hg-treasury-agent`
   - `services/hg-risk-oracle`
   - `services/hg-reporting-indexer`
   - `services/hg-proof-snapshotter`
- Prometheus endpoints are exposed in each service and wired by econ compose overlays.

### UI/API
- Next.js econ pages exist under `apps/web/app/econ/*`:
   - treasury, governance, risk, flows, proofs, alerts/logs
- API proxy route exists: `apps/web/app/api/econ/[...path]/route.ts`.

### CI/CD + release plumbing
- Dedicated econ workflow exists: `.github/workflows/econ-engine.yml`.
- Routing and governance verification scripts exist under `scripts/econ/`.
- Security checks include secret scan + Trivy in CI.

## 2) Residual hardening gaps discovered in baseline

1. Some `hg-*` services used permissive fallback signing secrets at runtime; production/mainnet should reject placeholder/default secret values.
2. Compose econ overlays had least-privilege controls but lacked explicit network segmentation and explicit resource constraints per service.
3. Baseline and production-ready evidence docs need refresh to reflect current implemented modules and verification outputs.

## 3) Enforced routing law + governance invariants

Mandatory law encoded in contracts/tests:
- L3 transacts only with L2.
- L2 transacts only with L1 (GhostChain).
- No direct L3→L1 bypass.
- No direct L2/L3 external yield deployment.
- External yield deployment only via L1 treasury/governance path.

Governance hard constraints:
- Treasury movement follows governance-approved execution paths.
- Mainnet execution mode requires `MainnetActivationGate`.
- Emergency pause/circuit-breaker controls are included in core contracts.

## 4) Security assumptions and secret policy

- No production secret material is generated or committed.
- Service signing keys are loaded from Vault/KMS/secret manager injected env values.
- `.env.example` files remain placeholder-only and non-secret.

## 5) Phase status snapshot

- PHASE 0: Completed (this baseline reflects current repo state).
- PHASE 1-6: Implemented modules are present; hardening and verification continue.
- PHASE 7: Production-ready evidence/report refresh pending fresh command outputs.

## 6) Compatibility strategy retained

- Keep econ additions isolated under `contracts/src/econ/`, `contracts/test/foundry/`, `services/hg-*`, `docs/econ/`, and `docker-compose.econ.*.yml`.
- Preserve existing monorepo services and compose stacks by using additive econ overlays.
- Avoid secret generation and destructive operations in automation paths.
