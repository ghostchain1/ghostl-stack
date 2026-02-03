# L3 Incident Response

## Severity levels
- **SEV-0**: L3 halted, parent L2 anchoring broken, bridge unsafe.
- **SEV-1**: Proposer/batcher stalled, prolonged parent L2 lag.
- **SEV-2**: RPC degradation, partial service impact.
- **SEV-3**: Minor anomalies, recoverable without intervention.

## Triage checklist
1) Run health checks:
   ```bash
   infra/scripts/doctor-l3.sh
   ```
2) Check AI monitor incidents:
   ```bash
   curl -fsS http://localhost:7577/status | jq .
   ```
3) Validate parent L2 RPC:
   ```bash
   curl -fsS http://localhost:29547 -H content-type:application/json -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
   ```

## Containment
- Pause/throttle via Guard if policy allows.
- Restart stalled services (l3-op-batcher/l3-op-proposer/l3-op-node).
- Escalate to governance for Tier 2/3 actions.

## Post-incident
- Capture evidence pack:
  ```bash
  infra/scripts/evidence-pack-l3.sh
  ```
- Preserve AI evidence bundles:
  - `services/ghost-gas-engine/data/evidence`
  - `services/ghost-gas-engine/data/proposals`
  - `services/ai-monitor/data/evidence`
- File postmortem and attach AI monitor incident logs.
