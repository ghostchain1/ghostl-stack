# Security Baseline

This repository enforces a default-deny, governance-locked security model.

## Mandatory Controls

- No plaintext secrets committed to source control.
- Mainnet deployment is blocked without governance approval JSON validation.
- Routing law must pass: L3↔L2 and L2↔L1 only; direct L3→L1 is forbidden.
- CI must pass routing and governance verification gates.
- Sovereign revenue loop enforces: `l3-fee-collector -> l2-revenue-aggregator -> treasury-engine (L1)` only.
- Treasury capital deployment requires governance proof with quorum + expired timelock.
- Reward distribution is timelocked and fails closed during emergency halt.

## Branch Protection Enforcement

- Configure required checks as documented in `docs/security/branch-protection.md`.
- Treat `routing-governance-gates` as mandatory for all merges into `main`.

## Verification Commands

- `bash scripts/verify-routing.sh`
- `bash scripts/verify-governance.sh --proposal-id <id>`
- `bash scripts/security/secret-scan.sh`
- `node --experimental-strip-types tools/ghostcontrol/supervisor.ts`
- `bash scripts/security/secure-production-build.sh --mode=production --secrets=vault`
- `bash scripts/smoke/sovereign-economy.sh`

## Mainnet Governance Lock

- Required file: `governance/proposals/<id>/approval.json`
- Validation entrypoint: `scripts/verify-governance.sh`
- `tools/ghostctl up mainnet --proposal-id <id>` fails closed when approval is absent or invalid.
