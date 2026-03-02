# Ghost Sync Sentinel — Ops Runbook

> **Service**: `ghost-sync-sentinel`  
> **Port**: `8787`  
> **Compose file**: `infra/opstack/docker-compose.yml`  
> **Source**: `services/ghost-sync-sentinel/`

---

## Overview

The Ghost Sync Sentinel is a lightweight TypeScript/Node microservice that continuously
polls all three GhostStack layers and exposes a unified health/status/metrics surface.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Kubernetes/Docker healthcheck — returns `200 healthy` or `503 unhealthy` |
| `GET /status` | Full JSON snapshot of L1/L2/L3 state + reasons for any failures |
| `GET /metrics` | Prometheus metrics (all `ghost_*` gauges + Node.js default metrics) |

### Routing Law (Non-Negotiable)

```
GhostL3 → GhostL2 (op-gate:8545 / l2-geth:8545)
GhostL2 → GhostChain L1 (l1-rpc-proxy:18546)
```

L3 must **never** communicate directly with L1. This is enforced by:
1. Docker network isolation (services on separate networks)
2. Sentinel configuration invariant (`L1_RPC_HOSTNAME_HINT`)
3. CI routing law static analysis (`.github/workflows/ghoststack-sync-validate.yml`)

---

## Running Locally

### With the full opstack stack

```bash
cd infra/opstack
docker compose up -d ghost-sync-sentinel
```

### Standalone (for development/testing)

```bash
cd services/ghost-sync-sentinel
npm install
npm run build

# Point at your local RPC endpoints
L1_RPC_URL=http://localhost:18546 \
L2_RPC_URL=http://localhost:9546 \
L3_RPC_URL=http://localhost:39546 \
ENFORCE_ROUTING_LAW=true \
L1_RPC_HOSTNAME_HINT=l1-rpc-proxy \
npm start
```

### Dev mode (watch + ts-node)

```bash
cd services/ghost-sync-sentinel
npm install
L1_RPC_URL=http://localhost:18546 \
L2_RPC_URL=http://localhost:9546 \
L3_RPC_URL=http://localhost:39546 \
npm run dev
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `L1_RPC_URL` | *(required)* | L1 eth JSON-RPC URL (`eth_syncing`, `eth_blockNumber`, `net_peerCount`) |
| `L2_RPC_URL` | *(required)* | L2 op-node rollup RPC URL (`optimism_syncStatus`) |
| `L3_RPC_URL` | *(required)* | L3 op-node rollup RPC URL (`optimism_syncStatus`) |
| `MAX_HEAD_LAG_SEC` | `180` | Max allowed head block timestamp lag (seconds) |
| `MAX_SAFE_LAG_SEC` | `600` | Max allowed safe block timestamp lag (seconds) |
| `POLL_INTERVAL_MS` | `10000` | Poll interval in milliseconds |
| `ENFORCE_ROUTING_LAW` | `true` | Enable routing law config invariant check |
| `L1_RPC_HOSTNAME_HINT` | *(optional)* | L1 hostname fragment; if found in L3_RPC_URL, routing law fails |

---

## Interpreting `/status` Reasons

The `/status` endpoint returns a JSON object. When `ok: false`, the `reasons` array
explains what failed. Common reasons and their remediation:

### `L1 is syncing (eth_syncing != false)`
- **Cause**: GhostChain L1 node is still syncing blocks.
- **Action**: Wait for sync to complete. Check `ghostchain-node1` logs:
  ```bash
  docker compose -f infra/ghostchain/docker-compose.l1.yml logs ghostchain-node1
  ```

### `L2 head stale: Xs (max 180s)`
- **Cause**: L2 op-node has not produced a new unsafe block in >180s.
- **Action**: Check op-node and op-sequencer:
  ```bash
  cd infra/opstack && docker compose logs op-node op-sequencer
  ```
  Verify L1 connectivity: `curl -s http://localhost:9546 -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}'`

### `L3 head stale: Xs (max 180s)`
- **Cause**: L3 op-node has not produced a new unsafe block in >180s.
- **Action**: Check l3-op-node:
  ```bash
  cd infra/opstack && docker compose -f docker-compose.l3.yml logs l3-op-node l3-geth
  ```

### `L2 safe stale: Xs (max 600s)`
- **Cause**: L2 batcher is not posting batches to L1, or L1 is congested.
- **Action**: Check op-batcher:
  ```bash
  cd infra/opstack && docker compose logs op-batcher
  curl -s http://localhost:7301/metrics | grep op_batcher
  ```

### `L3 safe stale: Xs (max 600s)`
- **Cause**: L3 batcher is not posting batches to L2.
- **Action**: Check l3-op-batcher:
  ```bash
  cd infra/opstack && docker compose -f docker-compose.l3.yml logs l3-op-batcher
  curl -s http://localhost:8301/metrics | grep op_batcher
  ```

### `ROUTING LAW VIOLATION: L3_RPC_URL contains L1 hostname hint`
- **Cause**: The sentinel's `L3_RPC_URL` env var contains the L1 hostname.
- **Action**: This is a **critical** misconfiguration. Fix the compose env immediately:
  - `L3_RPC_URL` must point to `l3-op-node:19546`, NOT `l1-rpc-proxy`.
  - Review all compose files for accidental L3→L1 wiring.

### `L2 unreachable: optimism_syncStatus: ...` / `L3 unreachable: ...`
- **Cause**: The op-node RPC is not responding.
- **Action**: Check if the container is running and healthy:
  ```bash
  docker compose ps op-node l3-op-node
  docker compose logs op-node
  ```

---

## Prometheus Metrics Reference

| Metric | Type | Description |
|---|---|---|
| `ghost_sync_ok` | Gauge | `1` = all layers healthy, `0` = unhealthy |
| `ghost_routing_law_ok` | Gauge | `1` = routing law satisfied, `0` = violated |
| `ghost_l1_syncing` | Gauge | `1` = L1 is syncing |
| `ghost_l1_peer_count` | Gauge | L1 peer count |
| `ghost_layer_head_lag_seconds{layer}` | Gauge | Head block timestamp lag (L2, L3) |
| `ghost_layer_safe_lag_seconds{layer}` | Gauge | Safe block timestamp lag (L2, L3) |
| `ghost_layer_head_block{layer}` | Gauge | Latest head block number (L1, L2, L3) |
| `ghost_layer_safe_block{layer}` | Gauge | Latest safe block number (L2, L3) |

---

## Alert Reference

Alerts are defined in `infra/opstack/observability/rules/ghoststack-sync.rules.yml`.

| Alert | Severity | Condition | Action |
|---|---|---|---|
| `GhostStackSyncUnhealthy` | critical | `ghost_sync_ok == 0` for 2m | Check `/status` reasons |
| `GhostRoutingLawViolation` | critical | `ghost_routing_law_ok == 0` for 30s | Fix L3→L1 config immediately |
| `GhostL1Syncing` | warning | `ghost_l1_syncing == 1` for 5m | Wait or investigate L1 node |
| `GhostL2HeadStale` | critical | L2 head lag > 180s for 2m | Check op-node/sequencer |
| `GhostL3HeadStale` | critical | L3 head lag > 180s for 2m | Check l3-op-node |
| `GhostL2SafeStale` | warning | L2 safe lag > 600s for 5m | Check op-batcher |
| `GhostL3SafeStale` | warning | L3 safe lag > 600s for 5m | Check l3-op-batcher |
| `GhostL1LowPeers` | warning | L1 peers < 3 for 10m | Check P2P connectivity |
| `GhostSyncSentinelDown` | critical | Prometheus can't scrape sentinel for 2m | Check container health |

---

## Adding New Checks

The sentinel is designed to be extended. To add a new check:

### 1. Add a new check function in `src/checks.ts`

```typescript
// Example: check op-batcher last batch submission time
export async function checkBatcherLag(url: string): Promise<number | undefined> {
  try {
    const metrics = await fetch(`${url}/metrics`).then(r => r.text());
    const match = metrics.match(/op_batcher_default_last_batcher_tx_unix\{stage="success"\}\s+([\d.]+)/);
    if (match) return Date.now() / 1000 - parseFloat(match[1]);
  } catch { /* ignore */ }
  return undefined;
}
```

### 2. Call it in `src/server.ts` `pollOnce()`

```typescript
const batcherLag = await checkBatcherLag("http://op-batcher:7301");
if (typeof batcherLag === "number" && batcherLag > 900) {
  // add to reasons or emit a new gauge
}
```

### 3. Add a Prometheus gauge in `buildServer()`

```typescript
const gBatcherLag = new Gauge({
  name: "ghost_l2_batcher_lag_seconds",
  help: "Seconds since last successful L2 batch submission",
  registers: [registry]
});
```

### 4. Add a Prometheus alert in `observability/rules/ghoststack-sync.rules.yml`

```yaml
- alert: GhostL2BatcherLagHigh
  expr: ghost_l2_batcher_lag_seconds > 900
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "L2 batcher lag is high"
    description: "op-batcher has not submitted a batch for {{ $value }}s."
```

---

## Zero-Downtime Deployment

The sentinel uses Docker `restart: unless-stopped` and a HEALTHCHECK. For zero-downtime
rolling updates in production (Docker Swarm / Compose with `update_config`):

```yaml
# Add to ghost-sync-sentinel service in production compose:
deploy:
  update_config:
    order: start-first        # new container starts before old one stops
    failure_action: rollback
  restart_policy:
    condition: on-failure
    max_attempts: 3
```

The CI pipeline (`.github/workflows/ghoststack-sync-validate.yml`) gates deployments by:
1. Building the sentinel image
2. Running routing law static analysis
3. Starting the sentinel and validating all three endpoints
4. Linting Prometheus rules with `promtool`

---

## Verification Checklist

Run these commands after deploying to verify the sentinel is working:

```bash
# 1. Check container is healthy
docker compose -f infra/opstack/docker-compose.yml ps ghost-sync-sentinel

# 2. Check /health
curl -s http://localhost:8787/health | jq .

# 3. Check /status (full snapshot)
curl -s http://localhost:8787/status | jq '{ok, routingLawOk, reasons}'

# 4. Check /metrics (Prometheus)
curl -s http://localhost:8787/metrics | grep ghost_

# 5. Verify Prometheus is scraping
curl -s http://localhost:9091/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="ghost-sync-sentinel")'

# 6. Verify alerts are loaded
curl -s http://localhost:9091/api/v1/rules | jq '.data.groups[] | select(.name=="ghoststack-sync-sentinel")'
