# Deploy Gate Incident Runbook

Use this when promotion or deployment gates fail.

## 1) Identify failing gate

- Routing gate: `bash scripts/verify-routing.sh`
- Governance gate: `bash scripts/verify-governance.sh --proposal-id <id>`
- Compose hardening gate: `bash scripts/security/compose-hardening-audit.sh`

## 2) Containment

- Stop rollout immediately.
- Keep current running environment unchanged.
- Capture gate output logs in incident evidence.

## 3) Recovery

- Routing failure: fix RPC/env wiring so L3 parent points to L2 and no L3→L1 path exists.
- Governance failure: provide valid `governance/proposals/<id>/approval.json` and re-run verify.
- Hardening failure: remove privileged/host-network settings before retry.

## 4) Re-validate

- `bash tools/ghostctl doctor`
- `bash tools/ghostctl verify-routing`
- `bash tools/ghostctl verify-governance --proposal-id <id>`

## 5) Resume

- Re-run promotion in order: devnet → testnet → mainnet.
