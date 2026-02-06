# GhostChain Stack Audit

Generated: 2026-01-23T18:55:00Z

## Runtime Snapshot (Docker)

### Compose projects (docker compose ls)
- `ghostchain`: `restarting(2), running(4)` (config files include `/infra/ghostchain/docker-compose.l1.yml` plus a backup path)
- `opstack`: `running(5)` (`/infra/opstack/docker-compose.yml`)

### Running containers (highlights)
- `ghostchain-ghostchain-bootnode-1`: **restarting**
- `ghostchain-ghostchain-node1-1`: healthy (RPC + WS + auth + metrics)
- `ghostchain-ghostchain-node2-1`: running
- `opstack-l2-geth-1`: healthy
- `opstack-op-node-1`: healthy
- `opstack-op-sequencer-1`: healthy
- `opstack-op-batcher-1`: healthy
- `opstack-op-gate-1`: healthy

### Networks
- `ghostchain_ghostchain`
- `opstack_default`

### Volumes
- GhostChain: `ghostchain_ghostchain-node1-data`, `ghostchain_ghostchain-node2-data`, `ghostchain_ghostchain-node3-data`, `ghostchain_ghostchain-node4-data`, `ghostchain_ghostscout-db-data`
- OP Stack: `opstack_op_gate_state`, `opstack_prometheus_data`, `opstack_grafana_data`, `opstack_loki_data`, `opstack_alertmanager_data`
- Compliance: `ghostchain-compliance_pg_data`, `ghostchain-compliance_redis_data`

## L1/L2/L3 Endpoint Matrix

### GhostChain (L1)
- RPC HTTP: `http://localhost:18545`
- RPC WS: `ws://localhost:18546`
- AuthRPC: `http://localhost:18552`
- Metrics: `http://localhost:18660`
- Chain ID: `14000101` (from `infra/ghostchain/docker-compose.l1.yml`)

### GhostL2 (OP Stack)
- RPC HTTP (L2 geth): `http://localhost:29547`
- Op-node RPC: `http://localhost:9546`
- Op-node metrics: `http://localhost:7300`
- Gate proxy RPC: `http://localhost:28546`
- Chain ID: `901` (from `infra/opstack/.env` + `infra/opstack/config/genesis-l2.json`)

### GhostL3 (OP Stack)
- RPC HTTP (configured): `http://localhost:39545`
- Chain ID (configs): `902` (opstack `.env`), `903` (ghostl3 genesis)
- **Runtime status:** not running (no L3 containers detected)

## Detected Miswirings / Drift

1) **GhostChain compose drift**
   - Running `ghostchain` project references a backup compose file path (`/infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.<legacy>.yml`) instead of the repo copy. This is a configuration drift risk.

2) **GhostChain bootnode restart loop**
   - `ghostchain-ghostchain-bootnode-1` is in continuous restart. Likely missing or invalid `boot.key` or data path mismatch.

3) **L2 host RPC mismatch**
   - Runtime L2 RPC is bound to `29547`, but `services/stack.env` and `infra/opstack/.env` reference `18547`. This breaks host-based clients and any service using the env values.

4) **L1 RPC host mismatch in opstack**
   - `infra/opstack/.env` uses `L1_RPC=http://172.18.0.1:18545` while `docker-compose.yml` uses `host.docker.internal:18545`. This is inconsistent across stacks.

5) **L3 chain ID drift**
   - L3 chain ID varies between `902` and `903` across env + genesis. Must be normalized before bringing L3 online.

6) **Gas token drift**
   - Updated config now sets `GAS_TOKEN_L2=GHOST` and `GAS_TOKEN_L3=GHOST` to align with the L1 `GHOST` token. Verify runtime overrides match.

## Observability Wiring

- OP Stack compose includes Prometheus/Grafana/Loki data volumes but no running containers detected in `docker ps`. Observability stack appears configured but not active.

## Notes

- Root `docker-compose.yml` is a standalone compliance stack (`ghostchain-compliance`) and is not running.
- The UI stack (`apps/docker-compose.dev.yml`) is not running in current runtime.
