/**
 * GhostBrain Autonomous Infrastructure OS — Main Brain
 *
 * The central control loop.  Every BRAIN_TICK_MS (default 30 s) it:
 *   1. Collects infra snapshots (hypervisors + Docker)
 *   2. Evaluates threshold breaches per resource
 *   3. Predicts crash risk per breached resource
 *   4. Evaluates system-wide alerts
 *   5. Schedules autonomous recovery for at-risk resources
 *   6. Computes load-balancer rebalance recommendations
 *   7. Runs memory-tier balancing
 *   8. Updates Prometheus metrics
 *   9. Pushes metrics to Pushgateway
 *  10. Announces self to cluster
 */

import { getInfraHistory }               from "../memory/infrastructure_memory.js";
import { checkAll }                      from "../protection/threshold_monitor.js";
import { predict }                       from "../protection/crash_predictor.js";
import { recordCritEvent, getUnstableResources } from "../protection/stability_guard.js";
import { computeRebalanceRecs, lbStats } from "../orchestrator/load_balancer.js";
import type { JobType }                  from "../orchestrator/resource_scheduler.js";
import { enqueue, schedulerStats, Priority } from "../orchestrator/resource_scheduler.js";
import { balanceTick }                   from "../orchestrator/memory_balancer.js";
import { evaluate as evaluateAlerts }    from "../observability/alert_engine.js";
import { inc, set, initStandardMetrics } from "../observability/metrics_exporter.js";
import { pushMetrics }                   from "../observability/prometheus_gateway.js";
import { log }                           from "../observability/event_logger.js";
import { announceToCluster }             from "../cluster/cluster_node.js";
import { pushInsight }                   from "../cluster/cluster_gossip.js";
import { emitBrainEvent }               from "./event_loop.js";
// ── Predictive AI pipeline ────────────────────────────────────────────────────
import { recordSample, forecastAll, forecasterStats } from "../predictive/load_forecaster.js";
import { detectAnomaly, getAnomalies }   from "../predictive/anomaly_detector.js";
import { recordMetricSample, detectRecurringPatterns, getPatterns } from "../predictive/pattern_recognition.js";
import { updateForecasts, analyzeAndRecommend } from "../predictive/predictive_balancer.js";
import { predictFailures, failurePredictorStats } from "../predictive/failure_predictor.js";

/** Map a recovery action label to a valid scheduler JobType. */
function toJobType(action: string): JobType {
  const MAP: Record<string, JobType> = {
    alert:        "alert",
    throttle:     "throttle",
    scale_memory: "scale_memory",
    restart:      "restart",
    migrate:      "migrate",
    emergency:    "restart",
    rebalance:    "rebalance",
  };
  return MAP[action] ?? "alert";
}

// ── Config ────────────────────────────────────────────────────────────────────

const TICK_MS                  = Number(process.env.BRAIN_TICK_MS       ?? "30000");
const RECOVERY_THRESHOLD_SCORE = Number(process.env.RECOVERY_MIN_SCORE  ?? "0.6");
const MAX_RECOVERY_PER_TICK    = Number(process.env.MAX_RECOVERY_TICK   ?? "3");

// ── State ─────────────────────────────────────────────────────────────────────

let _interval:   ReturnType<typeof setInterval> | null = null;
let _tickCount   = 0;
let _lastTickAt  = 0;
let _lastTickMs  = 0;
let _running     = false;
let _initDone    = false;

// ── Main Tick ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (!_running) return;
  const start = Date.now();
  _tickCount++;

  try {
    // ── 1. Build ResourceSnapshots from recent infra history ───────────────
    const history = getInfraHistory(undefined, undefined, TICK_MS * 2);
    const resourceSnaps = history.map(s => ({
      resourceId:    s.resourceId,
      cpuPercent:    s.cpuPct,
      memPercent:    s.memPct,
      diskPercent:   s.diskIoPct,
      ioWaitPercent: 0,
      swapMb:        0,
      ts:            s.ts,
    }));

    inc("ghostbrain_collect_cycles", "Infra collect cycles", 1);

    // ── 1b. Feed predictive pipeline ─────────────────────────────────────────
    //   - record samples for forecaster + pattern recogniser
    //   - detect anomalies
    //   - run pattern scan (cheap autocorrelation)
    //   - predict failures per resource
    //   - generate balancer recommendations
    const uniqueResources = [...new Set(resourceSnaps.map(s => s.resourceId))];
    for (const snap of resourceSnaps) {
      recordSample(snap.resourceId, "cpu",  snap.cpuPercent,  snap.ts);
      recordSample(snap.resourceId, "mem",  snap.memPercent,  snap.ts);
      recordSample(snap.resourceId, "disk", snap.diskPercent, snap.ts);
      recordMetricSample(snap.resourceId, "cpu",  snap.cpuPercent,  snap.ts);
      recordMetricSample(snap.resourceId, "mem",  snap.memPercent,  snap.ts);
      recordMetricSample(snap.resourceId, "disk", snap.diskPercent, snap.ts);
      detectAnomaly(snap.resourceId, "cpu",  snap.cpuPercent,  snap.ts);
      detectAnomaly(snap.resourceId, "mem",  snap.memPercent,  snap.ts);
      detectAnomaly(snap.resourceId, "disk", snap.diskPercent, snap.ts);
    }

    detectRecurringPatterns();
    const allPatterns  = getPatterns();
    const allAnomalies = getAnomalies();

    // Per-resource: forecasts + failure predictions
    for (const rid of uniqueResources) {
      const fcs = forecastAll(rid);
      updateForecasts(rid, fcs);
      predictFailures(rid, fcs, allAnomalies, allPatterns);
    }

    // Balancer recommendations
    const balancerRecs = analyzeAndRecommend(allAnomalies);
    if (balancerRecs.length > 0) {
      emitBrainEvent("REBALANCE_NEEDED", { recommendations: balancerRecs, source: "predictive" });
      for (const rec of balancerRecs) {
        void pushInsight({ type: "predicted_overload", resourceId: rec.sourceResourceId, detail: rec.reason, score: rec.urgencyScore / 100 });
      }
    }

    // Predictive Prometheus gauges
    const fpStats = failurePredictorStats();
    set("ghostbrain_prediction_high_risk", "Resources with high/imminent failure risk", fpStats.highRiskNow);
    set("ghostbrain_prediction_imminent",  "Resources with imminent failure risk",       fpStats.imminentNow);
    set("ghostbrain_forecaster_resources", "Resources tracked by forecaster", forecasterStats().resources);

    // ── 2. Threshold check ──────────────────────────────────────────────────
    const allBreaches = checkAll(resourceSnaps);

    // Tally breached resources
    const breachedIds = new Set(allBreaches.map(b => b.resourceId));
    set("ghostbrain_threshold_breaches", "Active threshold breaches", breachedIds.size);

    for (const bid of breachedIds) recordCritEvent(bid);

    // ── 3. Crash risk prediction ─────────────────────────────────────────────
    const predictions = await Promise.all(
      [...breachedIds].map(rid =>
        predict(rid, allBreaches.filter(b => b.resourceId === rid))
      ),
    );

    const highRisk = predictions.filter(p => p.risk === "high" || p.risk === "imminent");

    set("ghostbrain_ai_decisions", "AI decisions made", predictions.length);
    emitBrainEvent("CRASH_PREDICTED", { count: highRisk.length, predictions });

    // ── 4. Alert evaluation ──────────────────────────────────────────────────
    const lb = lbStats();
    const sched = schedulerStats();
    const unstable = getUnstableResources();
    set("ghostbrain_stability_unstable", "Unstable resources", unstable.length);
    set("ghostbrain_queue_depth", "Scheduler queue depth", sched.queueDepth);

    evaluateAlerts({
      cpuPercent:     resourceSnaps.length
        ? resourceSnaps.reduce((a, s) => a + s.cpuPercent, 0) / resourceSnaps.length
        : 0,
      memPercent:     resourceSnaps.length
        ? resourceSnaps.reduce((a, s) => a + s.memPercent, 0) / resourceSnaps.length
        : 0,
      diskPercent:    resourceSnaps.length
        ? resourceSnaps.reduce((a, s) => a + s.diskPercent, 0) / resourceSnaps.length
        : 0,
      queueDepth:     sched.queueDepth,
      unstableCount:  unstable.length,
      crashRiskHigh:  highRisk.length,
    });

    // ── 5. Schedule autonomous recovery ──────────────────────────────────────
    let recoveryScheduled = 0;
    for (const p of highRisk) {
      if (recoveryScheduled >= MAX_RECOVERY_PER_TICK) break;
      if (p.score < RECOVERY_THRESHOLD_SCORE) continue;

      const action = p.suggestedAction ?? "alert";
      enqueue(toJobType(action), p.resourceId,
        p.risk === "imminent" ? Priority.EMERGENCY : Priority.HIGH,
        { resourceId: p.resourceId, action, score: p.score },
      );
      recoveryScheduled++;
      inc("ghostbrain_crash_prevention", "Crash prevention actions", 1);
      emitBrainEvent("RECOVERY_NEEDED", { resourceId: p.resourceId, action });

      // Gossip high-risk insight to cluster
      void pushInsight({
        type:       "crash_risk",
        resourceId: p.resourceId,
        detail:     `risk=${p.risk}`,
        score:      p.score,
      });
    }

    // ── 6. Rebalance recommendations ─────────────────────────────────────────
    const recs = computeRebalanceRecs();
    if (recs.length > 0) {
      emitBrainEvent("REBALANCE_NEEDED", { recommendations: recs });
      set("ghostbrain_infra_load_score", "Cluster infra load", lb.targets);
    }

    // ── 7. Memory tier balancing ─────────────────────────────────────────────
    try {
      await balanceTick();
      emitBrainEvent("MEMORY_PRESSURE", undefined);
    } catch { /* non-fatal */ }

    // ── 8. Update Prometheus metric set ──────────────────────────────────────
    inc("ghostbrain_ai_actions_total", "Total AI actions", recoveryScheduled);

    // ── 9. Push metrics to Pushgateway (best-effort) ─────────────────────────
    try { await pushMetrics(); } catch { /* non-fatal */ }

    // ── 10. Announce self to cluster ─────────────────────────────────────────

    try { await announceToCluster(); } catch { /* non-fatal */ }

    const elapsed = Date.now() - start;
    _lastTickMs  = elapsed;
    _lastTickAt  = Date.now();

    emitBrainEvent("TICK", { tick: _tickCount, elapsedMs: elapsed });
    log.info("brain_tick", `tick=${_tickCount} elapsed=${elapsed}ms snaps=${resourceSnaps.length} breaches=${allBreaches.length} recovery=${recoveryScheduled} highRisk=${highRisk.length}`);

  } catch (err) {
    log.error("brain_tick_error", `Brain tick threw: ${String(err)}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startBrain(): Promise<void> {
  if (_running) return;
  _running = true;

  if (!_initDone) {
    initStandardMetrics();
    _initDone = true;
  }

  // First tick is immediate, then on interval
  await tick();
  _interval = setInterval(() => { void tick(); }, TICK_MS);

  log.info("brain_start", `GBA-OS brain started — tick every ${TICK_MS}ms`);
}

export function stopBrain(): void {
  if (!_running) return;
  _running = false;
  if (_interval) { clearInterval(_interval); _interval = null; }
  log.info("brain_stop", "GBA-OS brain stopped");
}

export function brainStatus(): {
  running:    boolean;
  tickCount:  number;
  lastTickAt: number;
  lastTickMs: number;
  tickMs:     number;
} {
  return {
    running:    _running,
    tickCount:  _tickCount,
    lastTickAt: _lastTickAt,
    lastTickMs: _lastTickMs,
    tickMs:     TICK_MS,
  };
}
