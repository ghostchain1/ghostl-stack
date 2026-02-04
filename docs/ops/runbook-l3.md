# L3 Operations Runbook

Evidence index: `docs/evidence/README.md`

## Quick checks

```bash
bash infra/scripts/doctor-l3.sh
```

## Core endpoints

- Parent L2 RPC: `HOST_L2_RPC`
- L3 RPC: `HOST_L3_RPC`
- L3 rollup RPC: `http://localhost:39546`
- Metrics: `http://localhost:8300/metrics`, `http://localhost:8301/metrics`, `http://localhost:8302/metrics`

## Standard start/stop

```bash
# Start L3 stack
infra/scripts/opstack/up-l3.sh

# Stop L3 stack
infra/scripts/opstack/down-l3.sh
```

## Common issues

### Parent L2 RPC unreachable
- Confirm L2 stack is up.
- Verify `HOST_L2_RPC` in `infra/opstack/.env`.
- Check firewall rules and proxy health.

### L3 op-node unreachable
- `docker compose -f infra/opstack/docker-compose.l3.yml ps l3-op-node`
- Check `l3-op-node` logs for parent RPC errors.

### Batcher idle / proposer stalled
- Verify metrics endpoints: `curl -fsS http://localhost:8301/metrics | head -n 5`
- Restart batcher/proposer if necessary.

## AI evidence retention

- Archive AI policy evidence: `services/ghost-gas-engine/data/evidence`
- Archive AI policy proposals: `services/ghost-gas-engine/data/proposals`
- Archive AI monitor action evidence: `services/ai-monitor/data/evidence`

```bash
tar -czf infra/evidence/out/ai-evidence-l3-$(date -u +%Y%m%dT%H%M%SZ).tgz \
  services/ghost-gas-engine/data/evidence \
  services/ghost-gas-engine/data/proposals \
  services/ai-monitor/data/evidence
```

## Federation policy checkpoint

```bash
POLICY_CHECKPOINT_NETWORK=ghostl2 \
POLICY_CHECKPOINT_LAYER=L2 \
infra/scripts/federation/export-policy-checkpoint.sh
```

## Phase 5 evidence references

- Whitepaper: `docs/architecture/ghostchain-ai-governance-whitepaper.md`
- Store a deterministic hash alongside the evidence pack:

```bash
sha256sum docs/architecture/ghostchain-ai-governance-whitepaper.md | \
  tee infra/evidence/out/ai-governance-whitepaper-l3-$(date -u +%Y%m%dT%H%M%SZ).sha256
```
