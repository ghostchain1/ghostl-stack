# GhostLoad Rollout and Rollback

## Navigation
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Baseline: [BASELINE.md](./BASELINE.md)
- Governance Proposal: [GOVERNANCE_PROPOSAL.md](./GOVERNANCE_PROPOSAL.md)
- Readiness Summary: [../../artifacts/ghostload/READINESS_SUMMARY.md](../../artifacts/ghostload/READINESS_SUMMARY.md)

## Feature flags (default safe)
- `GHOSTLOAD_AUTONOMOUS_ENABLED=0`
- `GHOSTLOAD_MANUAL_ONLY=1`
- `GHOSTLOAD_KILL_SWITCH=0`

## Environments
1. **Devnet**
   - Deploy `ghostload-ai` + `ghostload-controller`
   - Run sim scenarios and policy tests
   - Manual apply only
2. **Canary**
   - Enable autonomous mode for non-critical knobs only
   - 10% scope for selected workloads/contracts
   - Enforce strict alert thresholds
3. **Full**
   - Require governance approval artifact for critical classes
   - Keep kill switch and manual override always available

## Preflight checklist
- Policy validates (`packages/ghostload-policy/test`)
- Routing law invariants pass
- Simulation acceptance passes all stress scenarios
- Controller `/health` and `/status` green
- Alert rules loaded

## Acceptance evidence
- Simulator result artifacts are written to `artifacts/ghostload/*.result.json`
- Recommended command:
   - `for s in l1-fee-spike l2-sequencer-slowdown l3-demand-surge spam-attack bridge-burst; do node tools/ghostload-sim/src/cli.js --scenario=$s --out=artifacts/ghostload/$s.result.json; done`
- Release gate: each artifact must contain `acceptance.allPassed=true`

## Security scan hygiene (local vs CI)
- CI `repo-security` runs on clean checkout and should not include developer-local secret files.
- If local Trivy scan flags JWT/secret findings in `.env` or `.env.local`, treat as local-environment noise unless those files are tracked in git.
- For CI-like local verification, exclude developer env files:
   - `trivy fs --timeout 10m --scanners secret --secret-config trivy-secret.yaml --exit-code 1 --skip-dirs node_modules,contracts/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,contracts/typechain-types,contracts/proposals --skip-files .env,.env.local,ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json .`

## Emergency modes
- `stability-first`
- `liveness-first`
- `cost-cap`
- `lockdown` (manual-only)

## Rollback strategy
1. Set `GHOSTLOAD_KILL_SWITCH=1`
2. Set `GHOSTLOAD_MANUAL_ONLY=1`
3. Restore previous known-good knob snapshot (`/data/knobs.json` backup)
4. Pause critical onchain parameter updates via governance adapter
5. Keep monitoring active until backlog + volatility normalize

## Governance requirements before mainnet enablement
Ratify via GhostChain governance proposal:
- policy bounds per layer
- critical parameter list
- timelock duration
- emergency roles and pause authority
- audit log retention and signing key rotation policy

## Incident runbook (SEV-1: routing law violation attempt)
1. Trigger kill switch
2. Stop autonomous apply endpoint
3. Preserve signed audit log
4. Open governance incident proposal
5. Postmortem with invariant gap analysis
