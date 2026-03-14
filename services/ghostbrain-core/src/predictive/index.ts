/**
 * GhostBrain Predictive AI — Engine Orchestrator
 *
 * Central coordination loop for the predictive infrastructure AI.
 * Runs every TICK_MS (default 5 s) and drives:
 *
 *   1. Collect   — pull live metrics from OS / Docker / GhostChain RPCs
 *   2. Store     — append snapshot to tiered disk-backed memory
 *   3. Forecast  — update EWMA + linear trend forecasts for each resource
 *   4. Detect    — anomaly detection (z-score, MA envelope)
 *   5. Pattern   — temporal and correlative pattern recognition
 *   6. Predict   — multi-horizon failure risk scoring
 *   7. Balance   — emit migration / throttle recommendations
 *   8. Emit      — publish events into the GhostBrain kernel event bus
 *
 * Chain routing is enforced: L3 → L2 → L1 (never L3 → L1 directly).
 * This module has no direct execution authority — it only produces
 * recommendations that the orchestrator/resource_scheduler.ts acts on.
 */

import { collectInfraSnapshot, type InfraSnapshot } from "./metrics_collector.js";
import { hydrateStore, storeSnapshot, storeStats, shutdownStore } from "./disk_memory_store.js";
import { recordSample, forecastAll, trackedResources, forecasterStats } from "./load_forecaster.js";
import { detectAnomaly, getAnomalies, anomalyStats } from "./anomaly_detector.js";
import { recordMetricSample, detectRecurringPatterns, patternRecognitionStats } from "./pattern_recognition.js";
import { predictFailures, getActiveRisks, failurePredictorStats } from "./failure_predictor.js";
import { updateForecasts, analyzeAndRecommend, getRecommendations, predictiveBalancerStats } from "./predictive_balancer.js";
import { emitBrainEvent } from "../kernel/event_loop.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TICK_MS          = Number(process.env.PREDICTIVE_TICK_MS          ?? "5000");
const PATTERN_EVERY_N  = Number(process.env.PREDICTIVE_PATTERN_EVERY_N  ?? "12");  // ticks
const BALANCE_EVERY_N  = Number(process.env.PREDICTIVE_BALANCE_EVERY_N  ?? "6");   // ticks
const LOG_LEVEL        = process.env.PREDICTIVE_LOG ?? "info";

// ── State ─────────────────────────────────────────────────────────────────────

let _running      = false;
let _tickHandle:  ReturnType<typeof setInterval> | null = null;
let _tickCount    = 0;

// Latency tracking
let _totalTickMs  = 0;
let _ticksSampled = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level: "debug" | "info" | "warn", msg: string, meta?: object): void {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), service: "ghostbrain-predictive", level, msg, ...meta });
  if (level === "warn") process.stderr.write(line + "\n");
  else                  process.stdout.write(line + "\n");
}

/**
 * Extract a single resource ID from a snapshot.
 * Containers use their Docker name; host uses "host".
 */
function hostResourceId(): string { return "host"; }
function containerResourceId(name: string): string { return `container:${name}`; }

// ── Feed snapshot into forecaster + anomaly + pattern engines ─────────────────

function processSnapshot(snap: InfraSnapshot): void {
  const now = snap.collectedAt;

  // ── Host metrics ───────────────────────────────────────────────────────────
  const hostId = hostResourceId();
  const cpuLoad = snap.host.cpuLoad1m / Math.max(1, snap.host.cpuCount); // normalise 0–100 scale
  const cpuPct  = Math.min(100, cpuLoad * 100);
  const memPct  = snap.host.memUsagePct;

  recordSample(hostId, "cpu",  cpuPct,  now);
  recordSample(hostId, "mem",  memPct,  now);

  recordMetricSample(hostId, "cpu",  cpuPct,  now);
  recordMetricSample(hostId, "mem",  memPct,  now);

  detectAnomaly(hostId, "cpu",  cpuPct,  now);
  detectAnomaly(hostId, "mem",  memPct,  now);

  if (snap.host.diskIoMs !== undefined) {
    recordSample(hostId, "disk", snap.host.diskIoMs, now);
    detectAnomaly(hostId, "disk", snap.host.diskIoMs, now);
  }

  // ── Container metrics ──────────────────────────────────────────────────────
  for (const c of snap.containers) {
    const cId = containerResourceId(c.name);
    recordSample(cId, "cpu", c.cpuPct,  now);
    recordSample(cId, "mem", c.memPct,  now);
    recordMetricSample(cId, "cpu", c.cpuPct,  now);
    recordMetricSample(cId, "mem", c.memPct,  now);
    detectAnomaly(cId, "cpu", c.cpuPct,  now);
    detectAnomaly(cId, "mem", c.memPct,  now);
  }
}

// ── Forecast phase ────────────────────────────────────────────────────────────

function updateAllForecasts(): void {
  for (const resourceId of trackedResources()) {
    const forecasts = forecastAll(resourceId);
    updateForecasts(resourceId, forecasts);
  }
}

// ── Failure prediction ────────────────────────────────────────────────────────

function runFailurePrediction(snap: InfraSnapshot): void {
  const hostId    = hostResourceId();
  const forecasts = forecastAll(hostId);
  const anomalies = getAnomalies(hostId);
  const patterns  = detectRecurringPatterns().filter(p => p.resourceId === hostId);

  const predictions = predictFailures(hostId, forecasts, anomalies, patterns);

  for (const p of predictions) {
    if (p.risk === "imminent" || p.risk === "high") {
      emitBrainEvent("CRASH_PREDICTED", { source: "predictive", ...p });
      log("warn", "Failure risk elevated", { resourceId: p.resourceId, risk: p.risk, score: p.score, horizonMs: p.horizonMs });
    }
  }

  // Container-level prediction
  for (const c of snap.containers) {
    const cId    = containerResourceId(c.name);
    const cFcst  = forecastAll(cId);
    const cAnoms = getAnomalies(cId);
    const cPreds = predictFailures(cId, cFcst, cAnoms, []);
    for (const cp of cPreds) {
      if (cp.risk === "imminent" || cp.risk === "high") {
        emitBrainEvent("CRASH_PREDICTED", { source: "predictive-container", container: c.name, ...cp });
      }
    }
  }
}

// ── Balancer phase ────────────────────────────────────────────────────────────

function runBalancerAnalysis(): void {
  const recs = analyzeAndRecommend();
  for (const rec of recs) {
    if (rec.urgencyScore >= 75) {
      emitBrainEvent("REBALANCE_NEEDED", { source: "predictive-balancer", ...rec });
      log("warn", "Rebalance recommended", { urgency: rec.urgencyScore, action: rec.action, source: rec.sourceResourceId });
    }
  }
}

// ── Memory pressure check ─────────────────────────────────────────────────────

function checkMemoryPressure(snap: InfraSnapshot): void {
  const MEM_HIGH = Number(process.env.PREDICTIVE_MEM_HIGH_PCT ?? "85");
  if (snap.host.memUsagePct >= MEM_HIGH) {
    emitBrainEvent("MEMORY_PRESSURE", {
      source:     "predictive",
      memPct:     snap.host.memUsagePct,
      memFreeMB:  Math.round(snap.host.memFree / 1_048_576),
    });
  }
}

// ── Chain liveness alerts ─────────────────────────────────────────────────────

function checkChainHealth(snap: InfraSnapshot): void {
  for (const chain of snap.chains) {
    if (!chain.alive) {
      log("warn", "GhostChain RPC unresponsive", { chain: chain.chain, rpc: chain.rpc });
      emitBrainEvent("THRESHOLD_BREACH", {
        source:  "predictive-chain",
        chain:   chain.chain,
        chainId: chain.chainId,
        rpc:     chain.rpc,
      });
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (!_running) return;
  const t0 = Date.now();
  _tickCount++;

  try {
    // 1. Collect
    const snap = await collectInfraSnapshot();

    // 2. Store (disk-backed tiered memory)
    storeSnapshot(snap);

    // 3. Feed forecaster + anomaly + pattern
    processSnapshot(snap);

    // 4. Update forecasts for all tracked resources
    updateAllForecasts();

    // 5. Failure prediction (every tick)
    runFailurePrediction(snap);

    // 6. Memory pressure
    checkMemoryPressure(snap);

    // 7. Chain health
    checkChainHealth(snap);

    // 8. Pattern recognition (every PATTERN_EVERY_N ticks — heavier)
    if (_tickCount % PATTERN_EVERY_N === 0) {
      detectRecurringPatterns();
    }

    // 9. Balancer (every BALANCE_EVERY_N ticks)
    if (_tickCount % BALANCE_EVERY_N === 0) {
      runBalancerAnalysis();
    }

    // 10. Emit periodic TICK event for kernel listeners
    emitBrainEvent("TICK", { source: "predictive", tick: _tickCount });

  } catch (err) {
    log("warn", "Predictive tick error", { error: String(err) });
  }

  const elapsed = Date.now() - t0;
  _totalTickMs  += elapsed;
  _ticksSampled++;
  if (LOG_LEVEL === "debug") log("debug", "Tick complete", { tick: _tickCount, elapsedMs: elapsed });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** Start the predictive engine loop. Idempotent. */
export function startPredictiveEngine(): void {
  if (_running) return;
  _running = true;
  hydrateStore();
  _tickHandle = setInterval(() => { void tick(); }, TICK_MS);
  log("info", "GhostBrain Predictive Engine started", { tickMs: TICK_MS });
}

/** Stop the predictive engine loop and flush disk memory. */
export function stopPredictiveEngine(): void {
  if (!_running) return;
  _running = false;
  if (_tickHandle) { clearInterval(_tickHandle); _tickHandle = null; }
  shutdownStore();
  log("info", "GhostBrain Predictive Engine stopped");
}

// ── Stats / observability ─────────────────────────────────────────────────────

export function predictiveEngineStats() {
  return {
    running:       _running,
    tickCount:     _tickCount,
    avgTickMs:     _ticksSampled > 0 ? Math.round(_totalTickMs / _ticksSampled) : 0,
    disk:          storeStats(),
    forecaster:    forecasterStats(),
    anomaly:       anomalyStats(),
    pattern:       patternRecognitionStats(),
    failure:       failurePredictorStats(),
    balancer:      predictiveBalancerStats(),
    activeRisks:   getActiveRisks("elevated"),
    recommendations: getRecommendations(true).slice(0, 10),
  };
}
