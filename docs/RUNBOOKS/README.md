# Runbooks Index

- `ENV_PROMOTION.md`: required promotion order `devnet -> testnet -> mainnet`.
- `INCIDENT_DEPLOY_GATES.md`: triage and recovery when deploy gates fail.
- `SOVEREIGN_ENGINE.md`: runtime operations for L3->L2->L1 sovereign treasury loop.

## Core Commands

- `bash tools/ghostctl up devnet`
- `bash tools/ghostctl up testnet`
- `bash tools/ghostctl up mainnet --proposal-id <id>`
- `bash tools/ghostctl verify-routing`
- `bash tools/ghostctl verify-governance --proposal-id <id>`
- `bash scripts/security/compose-hardening-audit.sh`
