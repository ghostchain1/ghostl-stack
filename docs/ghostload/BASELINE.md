# GhostLoad Baseline (Phase 0)

## Navigation
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Rollout: [ROLLOUT.md](./ROLLOUT.md)
- Governance Proposal: [GOVERNANCE_PROPOSAL.md](./GOVERNANCE_PROPOSAL.md)
- Readiness Summary: [../../artifacts/ghostload/READINESS_SUMMARY.md](../../artifacts/ghostload/READINESS_SUMMARY.md)

## Collection method
Baseline sampled from local active RPC endpoints:
- L1: `http://127.0.0.1:18545`
- L2: `http://127.0.0.1:29547`
- L3: `http://127.0.0.1:39545`

Sampling method:
- 15 one-second samples per layer
- RPC methods: `eth_gasPrice`, `eth_blockNumber`, `eth_getBlockByNumber`, `txpool_status`
- Derived proxies:
  - `throughput_est_tps = mean(tx_per_block) / mean(block_time_seconds)`
  - volatility proxy = stddev of gas price (gwei)

## Baseline snapshot (2026-02-24)

| Layer | Mean Gas (gwei) | P95 Gas (gwei) | Gas Stddev | Mean Block Time (s) | Mean Tx/Block | Throughput TPS (est) | Pending Mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| L1 | 1.000000 | 1.000000 | 0.000000 | 1.000 | 0.000 | 0.000 | 1.000 |
| L2 | 0.001000 | 0.001000 | 0.000000 | 1.000 | 1.000 | 1.000 | 1.000 |
| L3 | 0.001000 | 0.001000 | 0.000000 | 1.000 | 1.000 | 1.000 | 0.000 |

## Target steady gas bands
- `L1_TARGET_GAS_GWEI_BAND = [0.9, 2.0]`
- `L2_TARGET_GAS_GWEI_BAND = [0.0008, 0.01]`
- `L3_TARGET_GAS_GWEI_BAND = [0.0008, 0.01]`

Hard guard bands are wider and encoded in policy defaults:
- L1 hard band `[0.8, 5.0]`
- L2 hard band `[0.0005, 0.05]`
- L3 hard band `[0.0005, 0.05]`

## Routing baseline validation
Routing constraints validated from config and policy:
- Allowed paths only: `L3->L2`, `L2->L1`
- External settlement layer fixed to `L1`
- Direct `L3->L1`, `L2->external`, `L3->external` marked policy violations

## Profitability model
GhostLoad uses:

`profit = fees_collected - (settlement_costs + infra_costs_proxy + incentives)`

`profit_margin_bps = 10000 * profit / max(fees_collected, epsilon)`

Initial policy floor:
- `profitFloorBps = 1200`

## Energy efficiency proxy metrics
- `retry_rate_pct`
- `wasted_compute_ratio_pct`
- `mempool_churn_proxy` (pending queue oscillation)
- `compression_ratio`
- `idle_overhead_proxy` (low utilization + high infra cost)

## Current baseline interpretation
- Gas is stable but workload is low/near-idle on L1.
- L2/L3 throughput is modest and stable.
- Main opportunity is autonomous cost-aware scaling under burst conditions while preserving route law and profit floor.
