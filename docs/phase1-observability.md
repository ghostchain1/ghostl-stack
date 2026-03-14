# Phase 1 Observability (Consensus Autonomy Layer - Observe Only)

This phase extends the existing `consensus-telemetry-service` to provide L1/L2/L3 health telemetry, incident detection, and Prometheus/Grafana integration. It does **not** mutate any chain state or restart clients.

## Service
- Location: `services/consensus-telemetry-service`
- Mode: observe-only (no actuation)
- Ports: `7635`

### HTTP endpoints
- `GET /healthz` – liveness
- `GET /readyz` – readiness (requires recent successful poll)
- `GET /metrics` – Prometheus metrics
- `GET /consensus` – last telemetry snapshot (L1/L2/L3 + incidents)

## RPC sources
The service resolves RPCs in this order:
1. `RPC_L1`, `RPC_L2`, `RPC_L3` env overrides
2. `RPC_REGISTRY_URL` (ghost-registry) chain registry

OP Stack sync status is optional and driven by:
- `OP_NODE_L2_RPC` (L2 op-node RPC, default host port `9546`)
- `OP_NODE_L3_RPC` (L3 op-node RPC, default host port `39546`)

## Metrics (Prometheus)
All metrics use the `ghost_consensus_*` namespace.

Core metrics (per layer):
- `ghost_consensus_layer_up{layer}`
- `ghost_consensus_layer_head_block{layer}`
- `ghost_consensus_layer_head_age_seconds{layer}`
- `ghost_consensus_layer_block_time_seconds{layer}`
- `ghost_consensus_layer_peer_count{layer}`
- `ghost_consensus_layer_txpool{layer,state}` (pending/queued)
- `ghost_consensus_layer_safe_block{layer}`
- `ghost_consensus_layer_finalized_block{layer}`
- `ghost_consensus_layer_syncing{layer}`

If an optional value cannot be derived (unsupported RPC or unavailable), gauges are set to `-1` to keep series stable.

OP Stack lag metrics (if op-node RPC is reachable):
- `ghost_consensus_op_lag_blocks{layer,type}` (unsafe_safe, safe_finalized)

Incident flags:
- `ghost_consensus_incident{layer,type}` (reorg_risk, stalled, peer_drop, syncing, oracle_lag, finalized_lag, portal_lag, rpc_error)
- `ghost_consensus_alerts_total{layer,type,action}` (open/clear transitions)

## Prometheus scrape config
The Phase 1 wiring adds a scrape job in both Prometheus configs:
- `infra/opstack/observability/prometheus.yml`
- `observability/infra/prometheus.yml`

Target:
- `consensus-telemetry-service:7635` with `metrics_path: /metrics`

## Grafana dashboard
New dashboard JSON:
- `infra/opstack/observability/grafana/dashboards/consensus-autonomy.json`

Panels include layer up status, head block/age, block time, peer count, and incidents.

## Environment variables (key ones)
These are defined in `services/consensus-telemetry-service/.env`.

- `RPC_L1`, `RPC_L2`, `RPC_L3`
- `OP_NODE_L2_RPC`, `OP_NODE_L3_RPC`
- `POLL_INTERVAL_MS`, `READY_MAX_STALE_MS`
- `STALL_THRESHOLD_SEC_L1`, `STALL_THRESHOLD_SEC_L2`, `STALL_THRESHOLD_SEC_L3`
- `PEER_MIN_L1`, `PEER_MIN_L2`, `PEER_MIN_L3`
- `OP_SAFE_LAG_BLOCKS`, `OP_FINALIZED_LAG_BLOCKS`, `OP_L1_LAG_BLOCKS`
- `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_TIMEOUT_MS`, `ALERT_WEBHOOK_RETRIES`, `ALERT_WEBHOOK_COOLDOWN_MS`

## Smoke checks
1. Start the service:
   - `docker compose -f services/consensus-telemetry-service/docker-compose.yml up -d`
2. Verify endpoints:
   - `curl -sf http://localhost:7635/healthz`
   - `curl -sf http://localhost:7635/readyz`
   - `curl -sf http://localhost:7635/metrics | head`
3. Confirm at least 10 metrics series exist for L1/L2/L3.

## Notes
- The service emits structured JSON logs for poll cycles and incident transitions.
- All behavior is read-only and does not touch validator/sequencer keys.
