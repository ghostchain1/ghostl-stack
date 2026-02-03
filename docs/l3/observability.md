# L3 Observability Wiring

## Prometheus scrape targets
- `l3-op-node`: `http://l3-op-node:8300/metrics`
- `l3-op-batcher`: `http://l3-op-batcher:8301/metrics`
- `l3-op-proposer`: `http://l3-op-proposer:8302/metrics`
- `l3-op-geth`: `http://l3-geth:6060/metrics`
- `ai-monitor-l3`: `http://host.docker.internal:7577/metrics`

## Grafana dashboards
- **opstack-observability**: includes an L3 row with event rate, channel input bytes, batcher/proposer idle time, and AI monitor incidents.

## AI monitor configuration (L3)
Set these in `services/ai-monitor/.env` (or in your orchestrator):
- `RPC_L3` pointing to L3 RPC.
- `RPC_L2` used as parent RPC for L3 checks.
- `OP_NODE_RPC_URL_L3=http://l3-op-node:19546`
- `OP_BATCHER_METRICS_URL_L3=http://l3-op-batcher:8301/metrics`
- `OP_PROPOSER_METRICS_URL_L3=http://l3-op-proposer:8302/metrics`

Taxonomy reference: `docs/l3/ai-monitor-taxonomy.md`.
