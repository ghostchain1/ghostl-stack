# GhostBrain — Reliability Architecture

## Objectives

| Metric                   | Target                      |
|--------------------------|-----------------------------|
| Availability             | 99.99% (< 52 min/year)      |
| MTTR (software fault)    | < 30 s (auto-restart)       |
| MTTR (hardware fault)    | < 5 min (failover to spare) |
| Data integrity           | Zero silent corruption      |
| Checkpoint overhead      | < 2% throughput impact      |

## ECC (`reliability/ecc_controller.cpp`)

- HBM and SRAM protected by SECDED (Single Error Correct, Double Error Detect) ECC
- ECC scrubber runs on full HBM scan every 24 hours (configurable)
- Single-bit errors: corrected silently, counter incremented (`ecc_single_bit_errors_total`)
- Double-bit errors (uncorrectable): tensor marked invalid, dependent ops blocked, alert fired

## Fault Detection (`reliability/fault_detector.cpp`)

Monitors:
1. **Compute correctness**: end-to-end checksums on matrix multiply results (ABFT — Algorithm-Based Fault Tolerance)
2. **Memory integrity**: ECC error counters polled every 1 s
3. **NoC health**: packet drop rate, CRC errors per link
4. **Thermal**: die temperature vs. TDP limit
5. **Power delivery**: VRM output voltage within ±2% tolerance

On fault:
```
detect → classify (transient | persistent | catastrophic)
       → transient: retry op up to 3 times
       → persistent: evict affected core, re-schedule op to spare
       → catastrophic: halt node, send alert to health_monitor
```

## Health Monitor (`reliability/health_monitor.cpp`)

- Heartbeat: each subsystem sends a heartbeat every 500 ms
- Missed heartbeat (3 consecutive): subsystem declared unhealthy
- Actions:
  - Restart subsystem (up to 3 times)
  - Promote standby replica if restart fails
  - Send alert to GhostBrain Core API (`/api/v1/health/alert`)
  - Log to GhostChain audit trail via `ai_event_logger.ts`

## Predictive Failure AI (`reliability/predictive_failure_ai.ts`)

- Runs as a lightweight inference loop (no GPU required)
- Input features: ECC error trend, temperature slope, VRM jitter, NoC error rate
- Model: gradient-boosted tree (100 estimators, trained offline on fault dataset)
- Outputs: probability of failure in next 1h / 24h per component
- Threshold: if P(failure in 1h) > 0.3 → trigger proactive migration
- Retraining: triggered by governance vote (human-ratified) with new fault data

## Checkpoint / Restore

- Checkpoint granularity: per-tensor (copy-on-write)
- Trigger: every 4 seconds (configurable via `CHECKPOINT_INTERVAL_MS`)
- Storage: host DRAM primary, persistent NVMe secondary
- Restore: on fault detection or node restart; replays from last checkpoint
- Overhead: < 2% measured on 7B parameter model inference loop

## Redundancy Model

| Component       | Redundancy    | Failover Time |
|-----------------|---------------|---------------|
| CPU runtime     | N+1 processes | < 5 s         |
| GPU / FPGA      | N+1 devices   | < 30 s        |
| Chiplet (Ph. 4) | N+2 die       | < 2 s (RAID-like spare routing) |
| HBM pages       | ECC + spare rows | Hardware, 0 s |
| Cluster node    | N+1 nodes     | < 5 min       |
