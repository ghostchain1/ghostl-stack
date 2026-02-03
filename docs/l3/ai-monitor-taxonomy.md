# L3 AI Monitor Incident Taxonomy

This taxonomy standardizes incident labels emitted by `services/ai-monitor` when `TARGET_LAYER=L3`.

## Core incidents (layer-scoped)
- `l3_rpc_unreachable`: L3 RPC endpoint failed; L3 node likely down or proxy unreachable.
- `l3_head_stale`: L3 head timestamp exceeds `HEAD_LAG_THRESHOLD_SEC`.
- `l3_parent_rpc_unreachable`: Parent (L2) RPC check failed.
- `l3_parent_head_stale`: Parent head lag exceeds `L1_HEAD_LAG_THRESHOLD_SEC` (for L3 this is L2).

## Rollup health
- `op_node_unreachable`: op-node RPC not responding.
- `batcher_stalled`: batcher metrics show no successful batch within `BATCHER_IDLE_THRESHOLD_SEC`.
- `proposer_stalled`: proposer metrics show no publish within `PROPOSER_IDLE_THRESHOLD_SEC`.
- `batcher_metrics_unreachable`: batcher metrics endpoint unreachable.
- `proposer_metrics_unreachable`: proposer metrics endpoint unreachable.

## Chain quality
- `syncing`: node reports syncing.
- `low_peers`: peer count below `MIN_PEERS`.
- `reorg_detected`: head reorg detected between polls.

## Governance safety
- `policy_registry_unreachable`: on-chain policy registry cannot be queried.
- `policy_denied`: policy disallows requested action.

## Operational notes
- All incident labels are emitted via `ai_monitor_incident_active{type="..."}`.
- Parent incidents are prefixed with `l3_parent_*` to avoid confusion with L1/L2 monitors.
