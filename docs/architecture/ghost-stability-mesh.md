# Ghost Stability Mesh

This repo already contains many service folders, but the stability layer was still missing three concrete runtime pieces:

1. A Ghost-native RPC concentrator that can absorb bursts without pinning every client to one upstream.
2. A durable transaction processor that survives restarts without keeping the full queue in memory.
3. A container-level memory guard that works even when services do not expose heap metrics.

## Repo findings

The current workspace has a few clear stability gaps:

- [`services/ghost-rpc-proxy/index.mjs`](/home/ghost/ghostl-stack/services/ghost-rpc-proxy/index.mjs) forwards to a single `UPSTREAM_URL`, so there is no layer pool, circuit breaker, or request dedupe.
- [`apps/worker/src/index.ts`](/home/ghost/ghostl-stack/apps/worker/src/index.ts) still describes itself as a placeholder job runner and defaults to `log-only` queue handling.
- [`services/mempool-service/src/index.js`](/home/ghost/ghostl-stack/services/mempool-service/src/index.js), [`services/block-index-service/src/index.js`](/home/ghost/ghostl-stack/services/block-index-service/src/index.js), and [`services/node-health-service/src/index.js`](/home/ghost/ghostl-stack/services/node-health-service/src/index.js) are useful observability slices, but they are not durable processing services and repeat a large amount of per-service HTTP shell code.

## Added services

### `ghost-rpc-aggregator`

Location: [`services/ghost-rpc-aggregator`](/home/ghost/ghostl-stack/services/ghost-rpc-aggregator)

- accepts only `ghost_*` RPC
- routes by layer: `POST /rpc/l1`, `POST /rpc/l2`, `POST /rpc/l3`
- verifies chain IDs against GhostChain L1 (`14000101`), GhostL2 (`901`), GhostL3 (`903`)
- short-lived caching for safe methods
- in-flight dedupe for repeated reads
- upstream failover and circuit breaking
- bounded cache size

### `ghost-tx-engine`

Location: [`services/ghost-tx-engine`](/home/ghost/ghostl-stack/services/ghost-tx-engine)

- durable append-only journal
- crash recovery for non-terminal jobs
- per-layer concurrency control
- capped retry backoff
- idempotent enqueue behavior
- Ghost-native submission through `ghost-sdk-core`

### `ghost-memory-guard`

Location: [`services/ghost-memory-guard`](/home/ghost/ghostl-stack/services/ghost-memory-guard)

- reads Docker container stats directly
- keeps bounded sample history
- emits incident journal entries
- correlates optional HTTP health checks
- auto-restart is disabled unless both:
  - `MEMORY_GUARD_AUTO_RESTART=true`
  - the container is present in `CONTAINER_ALLOWLIST`

## Launch

Use the bundle:

```bash
docker compose -f docker-compose.stability-mesh.yml up -d --build
```

Or run services independently from their own directories:

- [`services/ghost-rpc-aggregator/docker-compose.yml`](/home/ghost/ghostl-stack/services/ghost-rpc-aggregator/docker-compose.yml)
- [`services/ghost-tx-engine/docker-compose.yml`](/home/ghost/ghostl-stack/services/ghost-tx-engine/docker-compose.yml)
- [`services/ghost-memory-guard/docker-compose.yml`](/home/ghost/ghostl-stack/services/ghost-memory-guard/docker-compose.yml)
