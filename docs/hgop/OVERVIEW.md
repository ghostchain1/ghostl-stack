# HGOP v1.0 (Hyper Ghost Orchestration Protocol)

HGOP is a **proposal-first** supervisor that monitors GhostChain stack health (L1, L2, L3 + services), records incidents in SQLite, and generates deterministic fix proposals and governance bundles.

This repo ships HGOP as:

- Service: `services/hyper-ghost-supervisor` (Node/TypeScript, Express)
- DB: SQLite (default container path `/var/lib/ghost/incident.db`)
- Artifacts: Change Manifest (CMF) + governance calldata templates (default `/var/lib/ghost/hgop/CMF/<proposal_id>/...`)
- Metrics: Prometheus `/metrics`
- UI: Next.js dashboards under `/ai/hyperghost` (proxied through `/api/hyperghost/*`)

## Local Dev

1. Bring up the stack:

```bash
./dev-stack.sh
```

2. Ensure the supervisor is running:

```bash
docker compose -f infra/opstack/docker-compose.yml ps hyper-ghost-supervisor
curl -fsS http://127.0.0.1:7077/health | jq .
curl -fsS http://127.0.0.1:7077/status | jq .
```

3. Open UI:

- `apps/web`: `http://localhost:3200/ai/hyperghost`

## Docker Wiring

HGOP is added to `infra/opstack/docker-compose.yml` as `hyper-ghost-supervisor`:

- Port: `7077`
- Persistent volume: `hyperghost_data` mounted at `/var/lib/ghost`
- RPC probes:
  - L1: `http://ghost-rpc-proxy-l1:8546`
  - L2: `http://ghost-rpc-proxy-l2:8546`
  - L3: `http://ghost-rpc-proxy-l3:8546`

The `ghost-rpc-proxy-*` instances provide the canonical `gst_*` JSON-RPC namespace by rewriting to upstream `eth_*`.

Prometheus scrapes HGOP metrics via `infra/opstack/observability/prometheus.yml`.
