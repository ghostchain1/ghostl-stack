# L1 Incident Response

## Severity levels

- **SEV0**: chain halt, consensus failure, key compromise.
- **SEV1**: sustained RPC outage, critical data corruption risk.
- **SEV2**: partial degradation, high error rate, metrics gaps.
- **SEV3**: minor or localized issues.

## Immediate actions

1) Activate emergency mode if necessary:
   - `PauseGuardian.setPaused(true)`
   - `EmergencyShutdown.trigger("<reason>")`
2) Notify on-call and open incident ticket.
3) Capture evidence (logs, metrics, chain state hashes).

## Triage checklist

- Confirm RPC health: `infra/scripts/doctor-l1.sh`
- Inspect validator health and peer count.
- Check Vault status and secret availability.
- Check monitoring targets and alert pipelines.

## Recovery

- Apply targeted fixes per playbook.
- If required, execute rollback: `infra/scripts/rollback-l1.sh --tag=<last-good>`

## Postmortem

- Root cause analysis with evidence pack.
- Governance proposal for long-term fixes.
