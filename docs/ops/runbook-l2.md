# L2 Operations Runbook

## Quick checks

```bash
infra/scripts/doctor-l2.sh
```

## Core endpoints

- L1 RPC: `HOST_L1_RPC`
- L2 RPC: `HOST_L2_RPC`
- op-node RPC: `http://localhost:9546`
- Metrics: `http://localhost:7300/metrics`, `http://localhost:7301/metrics`, `http://localhost:7302/metrics`

## Standard start/stop

```bash
# Start L2 stack
infra/scripts/opstack/up-l2.sh

# Stop L2 stack
infra/scripts/opstack/down-l2.sh
```

## Common issues

### L1 RPC unreachable
- Confirm L1 stack is up.
- Verify `HOST_L1_RPC` in `infra/opstack/.env`.
- Check firewall rules and proxy health.

### op-node unreachable
- `docker compose -f infra/opstack/docker-compose.yml ps op-node`
- Check `op-node` logs for L1 RPC errors.

### Batcher idle / proposer stalled
- Verify metrics endpoints: `curl -fsS http://localhost:7301/metrics | head -n 5`
- Restart batcher/proposer if necessary.

### Policy registry missing
- Ensure `POLICY_REGISTRY_ADDRESS` is set in `infra/opstack/.env`.
- If `AI_MONITOR_OBSERVE_ONLY=0`, doctor-l2 fails closed.

## Evidence pack (latest)

Generate:

```bash
infra/scripts/evidence-pack-l2.sh
```

Verify:

```bash
EVIDENCE_TIMESTAMP=20260202T000000Z \
EVIDENCE_EPOCH=1769980800 \
infra/scripts/evidence-pack-l2.sh --verify
```

## Go/No-Go gate

```bash
infra/scripts/gates/l2-go-no-go.sh
```
