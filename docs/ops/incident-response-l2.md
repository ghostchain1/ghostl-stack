# L2 Incident Response

## Severity levels
- **SEV-0**: Chain halted, L1 anchoring broken, bridge unsafe.
- **SEV-1**: Proposer/batcher stalled, prolonged L1 lag.
- **SEV-2**: RPC degradation, partial service impact.
- **SEV-3**: Minor anomalies, recoverable without intervention.

## Triage checklist
1) Run health checks:
   ```bash
   infra/scripts/doctor-l2.sh
   ```
2) Check AI monitor incidents:
   ```bash
   curl -fsS http://localhost:7575/status | jq .
   ```
3) Validate L1 RPC:
   ```bash
   curl -fsS http://localhost:18545 -H content-type:application/json -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
   ```

## Containment
- Pause/throttle via Guard if policy allows.
- Restart stalled services (batcher/proposer/op-node).
- Escalate to governance for Tier 2/3 actions.

## Post-incident
- Capture evidence pack:
  ```bash
  infra/scripts/evidence-pack-l2.sh
  ```
- Preserve AI evidence bundles:
  - `services/ghost-gas-engine/data/evidence`
  - `services/ghost-gas-engine/data/proposals`
  - `services/ai-monitor/data/evidence`
- File postmortem and attach AI monitor incident logs.
