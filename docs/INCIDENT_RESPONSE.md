# Liquidity Gravity Engine (LGE) — Incident Response

This playbook focuses on safety actions that preserve funds and prevent continued exposure.

## Severity levels

- **SEV0:** Active loss of funds or high-confidence compromise of governance/relayers/operators.
- **SEV1:** Settlement overdue with principal outstanding; external venue degraded; inability to settle.
- **SEV2:** Elevated error rate, partial outages, or policy violations detected off-chain.

## Immediate actions (first 15 minutes)

1. **Pause deployments**
   - Use governance or emergency pauser to pause the affected adapter(s) in `CircuitBreaker`.
2. **Freeze operator bond (if configured)**
   - Lock operator bond via `OperatorBondVault` (governance / slasher).
3. **Preserve evidence**
   - Snapshot router logs: `artifacts/audit/liquidity-router/`
   - Capture current on-chain state and relevant tx hashes.

## Common incident scenarios

### Missed settlement window (SEV1)

- Trigger: `SettlementOracle.canContinue(adapterId)` returns false and principal is outstanding.
- Actions:
  - Call `SettlementOracle.enforceSettlementWindow(adapterId)` to pause and record penalty (safe).
  - Attempt to submit settlement immediately.
  - If settlement cannot be produced, keep adapter paused and unwind exposure if possible.

### Relayer quorum failure (SEV1/SEV0)

- Actions:
  - Rotate relayer set via governance and update threshold.
  - Confirm relayer keys are not compromised; revoke as needed.

### Suspected operator compromise (SEV0)

- Actions:
  - Pause adapter globally.
  - Lock operator bond.
  - Rotate operator address in `AdapterRegistry`.
  - Prepare slashing proposal with evidence hash and execute via governance.

## Post-incident

- Write a timeline with:
  - on-chain events
  - router audit events and signatures
  - settlement commitments and relayer signatures
- Update policies to prevent recurrence (caps, intervals, strategy allowlists).

