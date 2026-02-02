# Ghost L3 Reliability (Phase 3)

This document captures the Phase 3 reliability posture for Ghost L3.

## Deterministic boot

- `l3-geth` initializes its genesis once and reuses persistent data under `infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}`.
- Use `L3_DATA_PROFILE=dev` to create a disposable data dir (`data-${L3_CHAIN_ID}-dev`) without touching the canonical data.
- `l3-op-node` depends on `l3-geth` health and reuses `op-node` state under the same data dir.
- `l3-op-batcher` and `l3-op-proposer` depend on `l3-op-node` health and connect to parent L2 via `L3_L1_RPC`.

## Restart safety

- All L3 services use `restart: unless-stopped`.
- `stop_grace_period: 60s` is set to allow clean shutdown and journal flush before container stop.

## Parent sync correctness

Use `infra/scripts/doctor-l3.sh` to validate parent derivation and safe/unsafe head lag. Key controls:

- `L3_MAX_PARENT_DERIVATION_LAG` (default 128 blocks)
- `L3_MAX_L3_SAFE_LAG` (default 256 blocks)
- `L3_REQUIRE_L3_PROGRESS=1` to fail fast when L3 head is zero or sync status is missing

Example:

```bash
L3_REQUIRE_L3_PROGRESS=1 infra/scripts/doctor-l3.sh
```

## L3 metrics and activity

The doctor checks surface warnings when metrics endpoints are missing. Ensure these ports are exposed and services are running:

- `l3-op-node` metrics on `L3_METRICS_NODE_HOST_PORT` (default 8300)
- `l3-op-batcher` metrics on `L3_METRICS_BATCHER_HOST_PORT` (default 8301)
- `l3-op-proposer` metrics on `L3_METRICS_PROPOSER_HOST_PORT` (default 8302)
- `l3-geth` metrics on `L3_GETH_METRICS_HOST_PORT` (default 39606)

## Gate expectation

To validate Phase 3 in practice, restart any one of `l3-op-node`, `l3-op-batcher`, or `l3-op-proposer`, then confirm:

- `doctor-l3.sh` reports chain ID alignment + parent derivation within thresholds
- Rollup RPC responds to `optimism_syncStatus`
- L3 progresses beyond block 0 when `L3_REQUIRE_L3_PROGRESS=1`
