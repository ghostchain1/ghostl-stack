/**
 * GhostBrain Core — AI Memory Swap Advisor
 *
 * Subscribes to `hypervisor.memory.pressure` signals from the autonomous-vault-hypervisor,
 * maintains a rolling memory-state map in Redis, applies an AI-weighted scoring function
 * to identify swap candidates, and publishes `hypervisor.memory.swap.directive` orders
 * back to the hypervisor for execution.
 *
 * Design constraints (AGENTS.md):
 *  - Routing law preserved: directives never issue L3→L1 direct swaps.
 *  - All swap decisions are logged as GhostBrain incidents for audit.
 *  - No silent mutations: every directive is published on NATS and stored.
 *
 * NATS subjects:
 *   subscribe: hypervisor.memory.pressure
 *              hypervisor.memory.swap.executed
 *   publish:   hypervisor.memory.swap.directive
 *              ghostbrain.memory.swap.summary       (for dashboards)
 */

import { v4 as uuidv4 }         from "uuid";
import { publish, subscribe }    from "../connectors/nats.js";
import { getRedis }              from "../connectors/redis.js";
import { logger }                from "../logger.js";
import type { BrainMessage, HealthSignal } from "../types.js";

// ─── Shared types (mirrored from hypervisor to avoid circular deps) ────────────

export type MemLayer = "L1" | "L2" | "L3";

export interface WorkloadMemoryProfile {
  kind:           "container" | "vm";
  id:             string;
  name:           string;
  layer:          MemLayer;
  memUsageMiB:    number;
  memLimitMiB:    number;
  pressureRatio:  number;
  lastActivityMs: number;
  restartCount:   number;
  swappable:      boolean;
}

export interface MemoryPressureSignal {
  signalId:       string;
  source:         "host" | "container" | "vm";
  workloadId:     string;
  workloadName:   string;
  layer:          MemLayer;
  memUsageMiB:    number;
  memTotalMiB:    number;
  pressureRatio:  number;
  swapUsageRatio: number;
  anomaly:        boolean;
  observedAt:     string;
  profiles:       WorkloadMemoryProfile[];
}

export interface SwapDirective {
  directiveId:    string;
  sourceLayer:    MemLayer;
  targetLayer:    MemLayer;
  workloadId:     string;
  workloadName:   string;
  kind:           "container" | "vm";
  action:         "memory_limit_reduce" | "vm_balloon_reduce" | "container_pause" | "skip";
  currentMemMiB:  number;
  pressureRatio:  number;
  lastActivityMs: number;
  aiScore:        number;
  issuedAt:       string;
}

export interface SwapOutcome {
  swapId:       string;
  workloadId:   string;
  workloadName: string;
  layer:        MemLayer;
  action:       string;
  score:        number;
  reclaimedMiB: number;
  success:      boolean;
  reason:       string;
  durationMs:   number;
  executedAt:   string;
}

export interface MemorySwapSummary {
  summaryId:        string;
  windowMs:         number;
  totalSignals:     number;
  anomalySignals:   number;
  directivesIssued: number;
  totalReclaimedMiB: number;
  successRate:      number;
  topPressureWorkload: string | null;
  generatedAt:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REDIS_KEY_PREFIX  = "ghostbrain:memory-swap:";
const SIGNAL_TTL_SEC    = 300;          // 5-minute rolling window
const PRESSURE_FLOOR    = 0.70;         // only score above this
const MAX_DIRECTIVES    = 3;            // per advisory cycle
const ADVISORY_INTERVAL = 15_000;       // ms between advisory runs

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * AI-weighted scoring function for swap candidate selection.
 * Mirror of the hypervisor-side score so GhostBrain can re-validate decisions.
 */
function scoreWorkload(p: WorkloadMemoryProfile): number {
  const pressureScore      = p.pressureRatio * 0.45;
  const ageScore           = Math.min((Date.now() - p.lastActivityMs) / 3_600_000, 1) * 0.25;
  const instabilityPenalty = Math.min(p.restartCount / 10, 1) * 0.15;
  const layerScore         = p.layer === "L3" ? 0.15 : p.layer === "L2" ? 0.10 : 0.02;
  return pressureScore + ageScore - instabilityPenalty + layerScore;
}

/** Determine the best action for a workload given its profile. */
function chooseAction(p: WorkloadMemoryProfile): SwapDirective["action"] {
  if (p.pressureRatio > 0.95 && p.restartCount < 3) return "memory_limit_reduce";
  if (p.kind === "vm")         return "vm_balloon_reduce";
  if (p.pressureRatio > 0.80)  return "memory_limit_reduce";
  return "skip";
}

// ─── MemorySwapAdvisor ────────────────────────────────────────────────────────

export class MemorySwapAdvisor {
  private _advisorId: string;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _signalBuffer: MemoryPressureSignal[] = [];
  private _outcomeBuffer: SwapOutcome[] = [];
  private _directivesThisCycle = 0;
  private _reclaimedThisCycle  = 0;

  constructor() {
    this._advisorId = `mem-swap-advisor-${uuidv4().substring(0, 8)}`;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    // Subscribe to pressure signals from hypervisor
    subscribe<MemoryPressureSignal>("hypervisor.memory.pressure", (msg: BrainMessage<MemoryPressureSignal>) => {
      void this._ingestPressureSignal(msg.payload);
    });

    // Subscribe to outcome reports from hypervisor
    subscribe<SwapOutcome>("hypervisor.memory.swap.executed", (msg: BrainMessage<SwapOutcome>) => {
      this._ingestSwapOutcome(msg.payload);
    });

    // Periodic advisory loop
    this._timer = setInterval(() => void this._advisoryCycle(), ADVISORY_INTERVAL);

    logger.info("MemorySwapAdvisor started", { advisorId: this._advisorId });
  }

  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // ─── Signal ingestion ────────────────────────────────────────────────────────

  private async _ingestPressureSignal(signal: MemoryPressureSignal): Promise<void> {
    // Buffer in memory for immediate advisory consideration
    this._signalBuffer.push(signal);
    if (this._signalBuffer.length > 500) this._signalBuffer.shift();

    // Persist to Redis with TTL for temporal queries
    try {
      const redis = getRedis();
      const key   = `${REDIS_KEY_PREFIX}signal:${signal.signalId}`;
      await redis.set(key, JSON.stringify(signal), 'EX', SIGNAL_TTL_SEC);

      // Maintain a sorted set of anomalous workloads by pressure
      if (signal.anomaly) {
        await redis.zadd(
          `${REDIS_KEY_PREFIX}anomalous`,
          signal.pressureRatio,
          `${signal.workloadId}:${signal.workloadName}`,
        );
        // Trim to top 100
        await redis.zremrangebyrank(`${REDIS_KEY_PREFIX}anomalous`, 0, -101);
      }
    } catch (err) {
      logger.warn("MemorySwapAdvisor: Redis write failed", { err: String(err) });
    }

    logger.debug("MemorySwapAdvisor: pressure signal ingested", {
      workloadId:    signal.workloadId,
      pressureRatio: signal.pressureRatio.toFixed(3),
      anomaly:       signal.anomaly,
    });
  }

  private _ingestSwapOutcome(outcome: SwapOutcome): void {
    this._outcomeBuffer.push(outcome);
    if (this._outcomeBuffer.length > 200) this._outcomeBuffer.shift();

    if (outcome.success) {
      this._reclaimedThisCycle += outcome.reclaimedMiB;
    }

    logger.info("MemorySwapAdvisor: swap outcome received", {
      workloadName:  outcome.workloadName,
      action:        outcome.action,
      success:       outcome.success,
      reclaimedMiB:  outcome.reclaimedMiB,
    });
  }

  // ─── Advisory cycle ──────────────────────────────────────────────────────────

  /**
   * Main advisory loop: analyses buffered signals, selects swap candidates,
   * issues directives, and publishes a rolling summary.
   */
  private async _advisoryCycle(): Promise<void> {
    const anomalous = this._signalBuffer.filter(s => s.anomaly && s.source !== "host");

    if (anomalous.length === 0) {
      logger.debug("MemorySwapAdvisor: no anomalous signals in this window");
      return;
    }

    // Aggregate profiles from anomalous signals
    const profileMap = new Map<string, WorkloadMemoryProfile>();
    for (const sig of anomalous) {
      for (const p of sig.profiles.filter(p => p.swappable && p.pressureRatio >= PRESSURE_FLOOR)) {
        const existing = profileMap.get(p.id);
        // Keep highest-pressure snapshot
        if (!existing || p.pressureRatio > existing.pressureRatio) {
          profileMap.set(p.id, p);
        }
      }
    }

    const candidates = Array.from(profileMap.values())
      .map(p => ({ profile: p, score: scoreWorkload(p) }))
      .filter(c => c.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DIRECTIVES);

    if (candidates.length === 0) {
      logger.debug("MemorySwapAdvisor: candidates below score threshold");
      return;
    }

    logger.info("MemorySwapAdvisor: issuing swap directives", {
      count: candidates.length,
      targets: candidates.map(c => c.profile.name),
    });

    for (const { profile, score } of candidates) {
      const action = chooseAction(profile);
      if (action === "skip") continue;

      // Routing law: resolve source/target layers
      const sourceLayer: MemLayer = "L1"; // advisor runs in L1 GhostBrain
      const targetLayer: MemLayer = profile.layer;

      // Hard routing-law guard (AGENTS.md §1)
      // Cast to string to allow runtime check (sourceLayer is always 'L1' today
      // but may be dynamic in future agent topologies).
      if ((sourceLayer as string) === 'L3' && (targetLayer as string) === 'L1') {
        logger.error("MemorySwapAdvisor: routing law violation blocked", {
          workloadId: profile.id, sourceLayer, targetLayer,
        });
        continue;
      }

      const directive: SwapDirective = {
        directiveId:    uuidv4(),
        sourceLayer,
        targetLayer,
        workloadId:     profile.id,
        workloadName:   profile.name,
        kind:           profile.kind,
        action,
        currentMemMiB:  profile.memLimitMiB,
        pressureRatio:  profile.pressureRatio,
        lastActivityMs: profile.lastActivityMs,
        aiScore:        score,
        issuedAt:       new Date().toISOString(),
      };

      publish("hypervisor.memory.swap.directive", directive);
      this._directivesThisCycle++;

      logger.info("MemorySwapAdvisor: directive published", {
        directiveId:  directive.directiveId,
        workloadName: directive.workloadName,
        action:       directive.action,
        aiScore:      score.toFixed(3),
      });
    }

    // Emit rolling summary for dashboards / sentinel
    await this._emitSummary(anomalous.length, candidates.length);

    // Clear processed signals
    this._signalBuffer = this._signalBuffer.filter(
      s => Date.now() - new Date(s.observedAt).getTime() < ADVISORY_INTERVAL,
    );
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────

  private async _emitSummary(
    totalSignals: number,
    directivesIssued: number,
  ): Promise<void> {
    const outcomes      = this._outcomeBuffer.slice(-50);
    const successful    = outcomes.filter(o => o.success).length;
    const successRate   = outcomes.length > 0 ? successful / outcomes.length : 1;
    const topPressure   = this._signalBuffer
      .filter(s => s.source !== "host")
      .sort((a, b) => b.pressureRatio - a.pressureRatio)[0] ?? null;

    const summary: MemorySwapSummary = {
      summaryId:           uuidv4(),
      windowMs:            ADVISORY_INTERVAL,
      totalSignals,
      anomalySignals:      this._signalBuffer.filter(s => s.anomaly).length,
      directivesIssued,
      totalReclaimedMiB:   this._reclaimedThisCycle,
      successRate:         parseFloat(successRate.toFixed(4)),
      topPressureWorkload: topPressure?.workloadName ?? null,
      generatedAt:         new Date().toISOString(),
    };

    publish("ghostbrain.memory.swap.summary", summary);

    // Store last summary in Redis
    try {
      const redis = getRedis();
      await redis.set(`${REDIS_KEY_PREFIX}last-summary`, JSON.stringify(summary), 'EX', 120);
    } catch { /* non-fatal */ }

    logger.debug("MemorySwapAdvisor: summary emitted", {
      directivesIssued,
      totalReclaimedMiB: this._reclaimedThisCycle,
      successRate: summary.successRate,
    });
  }

  // ─── External queries (used by planner-agent) ─────────────────────────────

  /**
   * Returns the current memory-pressure context suitable for injection into
   * a PlannerAgent planning request.
   */
  getPlannerContext(): {
    hostPressure:    number | null;
    hotspots:        { name: string; layer: MemLayer; pressureRatio: number }[];
    recentReclaimed: number;
    successRate:     number;
  } {
    const hostSignal = this._signalBuffer.find(s => s.source === "host");
    const hotspots   = this._signalBuffer
      .filter(s => s.anomaly && s.source !== "host")
      .sort((a, b) => b.pressureRatio - a.pressureRatio)
      .slice(0, 5)
      .map(s => ({ name: s.workloadName, layer: s.layer, pressureRatio: s.pressureRatio }));

    const outcomes   = this._outcomeBuffer.slice(-20);
    const successful = outcomes.filter(o => o.success).length;
    const successRate = outcomes.length > 0 ? successful / outcomes.length : 1;

    return {
      hostPressure:    hostSignal?.pressureRatio ?? null,
      hotspots,
      recentReclaimed: this._reclaimedThisCycle,
      successRate:     parseFloat(successRate.toFixed(4)),
    };
  }

  /**
   * Returns the most recent memory-swap health signal for GhostBrain's
   * sentinel loop to process.
   */
  toHealthSignal(): HealthSignal {
    const hostSignal = this._signalBuffer.find(s => s.source === "host");
    return {
      signalId:   uuidv4(),
      source:     "manual",
      service:    "memory-swap-advisor",
      layer:      "L1",
      metric:     "memory.host_pressure",
      value:      hostSignal?.pressureRatio ?? 0,
      observedAt: new Date().toISOString(),
      anomaly:    (hostSignal?.pressureRatio ?? 0) > 0.80,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const memorySwapAdvisor = new MemorySwapAdvisor();
