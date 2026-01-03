# AI Guard Hooks for OP Stack

## Control Points
- **Batcher delay/throttle**: adjust submission cadence (seconds between batches) based on AI risk/congestion.
- **Finalize gating**: gate proposer/finalizer calls when Guard signals pause/high risk.
- **Policy endpoints (existing)**: Guard `/policy/delay`, `/policy/mode`, `/policy/threshold` drive actions.

## Integration Plan
1) Inputs
   - L2/L3 RPCs (op-node) for blocks/mempool.
   - Batcher/proposer queue depth and latency metrics.
   - Guard health + AI monitor metrics (`ai_monitor_*`).
2) Scoring
   - Keep current heuristic model; optionally add learned model.
   - Emit risk + congestion scores to Prometheus.
3) Actions
   - **Throttle batches**: AI monitor sets Guard delay; batcher reads delay before submitting.
   - **Pause finalization**: proposer checks Guard mode before finalize; skip when paused.
   - **Adaptive thresholds**: raise/lower Guard risk threshold based on congestion/backlog.
4) Contracts (future)
   - On-chain policy registry for batcher/proposer to read (optional).
   - Multisig/AI co-sign for high-risk finalize (optional).

## Minimal Hook Changes
- Batcher:
  - Before submit: fetch Guard delay; sleep accordingly; skip if Guard mode=pause.
  - Export metrics: batch queue length, submit latency.
- Proposer (finalizer):
  - Before finalize: fetch Guard mode; if pause -> skip; if delay -> backoff.
- AI monitor:
  - Already implemented in `services/ai-monitor` (observeOnly toggle); point RPCs to op-node endpoints and set `GUARD_URL` to Guard service.

## Config
- Env flags for batcher/proposer:
  - `GUARD_URL`, `ADMIN_TOKEN`
  - `ALLOW_GUARD_CONTROL=1`
  - `GUARD_DELAY_MAX_SEC`, `GUARD_PAUSE_MODE`
- Guard/AI:
  - `OBSERVE_ONLY=0` to allow actions.
  - Thresholds: `THROTTLE_THRESHOLD`, `PAUSE_THRESHOLD`, `BASE_DELAY_MS`, `MAX_DELAY_MS`.

## Rollout Steps
1) Add Guard-aware hooks to OP Stack batcher/proposer containers.
2) Point AI monitor to OP Stack RPCs; set `ADMIN_TOKEN`.
3) Add Grafana panels for `ai_monitor_*` and batcher/proposer delay metrics.
4) Load-test: drive traffic, verify dynamic delay/pause triggers and recovery.
