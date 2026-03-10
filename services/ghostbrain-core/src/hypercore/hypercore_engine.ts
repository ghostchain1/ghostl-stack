/**
 * GhostBrain HyperCore Engine — Layer 5: Strategic AI
 *
 * The apex of the GhostBrain intelligence stack.  Operates above the cognitive
 * reasoning layer (Layer 4) to provide system-wide strategic analysis,
 * cross-layer optimisation, and guided self-evolution.
 *
 * Full GhostBrain intelligence stack:
 *   Layer 1  Infrastructure Monitoring
 *   Layer 2  Neural Memory
 *   Layer 3  Predictive Intelligence
 *   Layer 4  Cognitive Reasoning
 *   Layer 5  HyperCore Strategic AI  ← this module
 *
 * Intelligence pipeline (default: 15-second autonomous cycle):
 *   1. LLM Reasoner      llmReasoner.analyze()          → SystemInsight[]
 *   2. DevOps AI         devopsAI.suggest(insights)     → Improvement[]
 *   3. Blockchain AI     blockchainAI.optimize()        → ChainStrategy[]
 *   4. Swarm dispatch    swarmController.dispatch()     (autonomous only)
 *   5. Evolution         evolutionEngine.evolve()       (every N cycles)
 *
 * Safety:
 *   - All advisories forwarded to signing relay (:7910) for human review
 *   - VM restarts and governance changes are never autonomously executed
 *   - Evolution proposals are always tagged requires_human_review: true
 *   - HYPERCORE_DRY_RUN=1 logs all actions without executing any dispatch
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_cycles_total
 *   ghostbrain_hypercore_cycle_duration_seconds  (histogram)
 *   ghostbrain_hypercore_insights_per_cycle      (gauge)
 *   ghostbrain_hypercore_improvements_per_cycle  (gauge)
 *   ghostbrain_hypercore_strategies_per_cycle    (gauge)
 */

import { randomUUID }       from "node:crypto";
import { llmReasoner }      from "./llm_reasoner.js";
import { devopsAI }         from "./devops_ai.js";
import { blockchainAI }     from "./blockchain_ai.js";
import { swarmController }  from "./swarm_controller.js";
import { evolutionEngine }  from "./evolution_engine.js";
import { inc, set, observe } from "../observability/metrics_exporter.js";
import { log }              from "../observability/event_logger.js";
import type { SystemInsight }      from "./llm_reasoner.js";
import type { Improvement }        from "./devops_ai.js";
import type { ChainStrategy }      from "./blockchain_ai.js";
import type { HyperCycleSummary }  from "./evolution_engine.js";
import type { JobType }            from "../orchestrator/resource_scheduler.js";

// ── Config ────────────────────────────────────────────────────────────────────

const _loopMs      = Number(process.env.HYPERCORE_LOOP_MS        ?? "15000");
const _warmupMs    = Number(process.env.HYPERCORE_WARMUP_MS      ?? "20000");
const _evolveEvery = Number(process.env.HYPERCORE_EVOLVE_EVERY_N ?? "20");   // evolve every N cycles
const DRY_RUN      = process.env.HYPERCORE_DRY_RUN === "1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HyperCoreEvaluation {
  id:           string;
  ts:           number;
  durationMs:   number;
  insights:     SystemInsight[];
  improvements: Improvement[];
  strategies:   ChainStrategy[];
  dispatched:   number;
  dryRun:       boolean;
}

// ── Internal state ────────────────────────────────────────────────────────────

const _evaluations:    HyperCoreEvaluation[] = [];
const _cycleSummaries: HyperCycleSummary[]   = [];
const MAX_EVALUATIONS                        = 100;

let _cycles = 0;
let _paused = false;
let _timer: ReturnType<typeof setInterval> | null = null;

function pushEval(ev: HyperCoreEvaluation): void {
  _evaluations.push(ev);
  if (_evaluations.length > MAX_EVALUATIONS) _evaluations.shift();

  _cycleSummaries.push({
    ts:            ev.ts,
    insightCount:  ev.insights.length,
    criticalCount: ev.insights.filter(i => i.severity === "critical").length,
    improvements:  ev.improvements.length,
    autonomous:    ev.improvements.filter(i => i.autonomous).length,
    strategies:    ev.strategies.length,
    chainCritical: ev.strategies.filter(s => s.status === "critical").length,
  });
  if (_cycleSummaries.length > MAX_EVALUATIONS) _cycleSummaries.shift();
}

// ── Action → JobType mapping ─────────────────────────────────────────────────

function mapActionToJobType(action: string): JobType {
  if (action.includes("restart"))      return "restart";
  if (action.includes("scale_mem"))    return "scale_memory";
  if (action.includes("scale"))        return "scale_memory";
  if (action.includes("rebalance"))    return "rebalance";
  if (action.includes("throttle"))     return "throttle";
  if (action.includes("migrate"))      return "migrate";
  if (action.includes("alert") || action.includes("security")) return "alert";
  if (action.includes("learn"))        return "learn";
  return "collect";
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the full HyperCore intelligence pipeline once.
 * Suitable for on-demand invocation via the API or by the autonomous loop.
 */
export async function evaluateSystem(): Promise<HyperCoreEvaluation> {
  const t0 = Date.now();
  _cycles++;
  inc("ghostbrain_hypercore_cycles_total", "Total HyperCore evaluation cycles");

  // ── Step 1: LLM Reasoner ─────────────────────────────────────────────────
  const insights = await llmReasoner.analyze();
  set("ghostbrain_hypercore_insights_per_cycle", "Insights generated per HyperCore cycle", insights.length);

  // ── Step 2: DevOps AI ────────────────────────────────────────────────────
  const improvements = devopsAI.suggest(insights);
  set("ghostbrain_hypercore_improvements_per_cycle", "Improvements proposed per HyperCore cycle", improvements.length);

  // ── Step 3: Blockchain AI ────────────────────────────────────────────────
  const strategies = blockchainAI.optimize();
  set("ghostbrain_hypercore_strategies_per_cycle", "Chain strategies generated per HyperCore cycle", strategies.length);

  // ── Step 4: Swarm dispatch ───────────────────────────────────────────────
  let dispatched = 0;

  if (!DRY_RUN) {
    // Dispatch autonomous infrastructure improvements
    for (const imp of improvements) {
      if (!imp.autonomous) continue;
      const dp: import("./swarm_controller.js").DirectivePriority =
        imp.priority === "medium" ? "normal" : imp.priority;
      swarmController.dispatch(
        imp.action,
        mapActionToJobType(imp.action),
        imp.resourceId,
        imp.params,
        { priority: dp, autonomous: true, source: "hypercore" },
      );
      dispatched++;
    }

    // Broadcast critical chain alerts through the swarm
    for (const s of strategies) {
      if (s.status === "critical" && !s.requiresGovernance) {
        const layerStr = typeof s.params["layer"] === "string" ? s.params["layer"] : "chain";
        swarmController.broadcastAlert(s.finding, "critical", layerStr);
        dispatched++;
      }
    }

    // Broadcast system-wide security alerts from LLM insights
    for (const ins of insights) {
      if (ins.domain === "security" && ins.severity === "critical") {
        swarmController.broadcastAlert(ins.finding, "critical", "system");
        dispatched++;
      }
    }
  } else {
    const would = improvements.filter(i => i.autonomous).length + strategies.filter(s => s.status === "critical" && !s.requiresGovernance).length;
    log.info("hypercore", `DRY_RUN: would dispatch ${would} directives`);
  }

  // ── Step 5: Periodic evolution ───────────────────────────────────────────
  if (_cycles % _evolveEvery === 0) {
    try {
      await evolutionEngine.evolve(_cycleSummaries);
    } catch (err) {
      log.warn("hypercore", `evolution error: ${String(err)}`);
    }
  }

  const durationMs = Date.now() - t0;
  observe(
    "ghostbrain_hypercore_cycle_duration_seconds",
    "HyperCore evaluation cycle duration in seconds",
    durationMs / 1000,
  );

  const ev: HyperCoreEvaluation = {
    id:           randomUUID(),
    ts:           Date.now(),
    durationMs,
    insights,
    improvements,
    strategies,
    dispatched,
    dryRun:       DRY_RUN,
  };

  pushEval(ev);

  log.info(
    "hypercore.engine",
    `cycle=${_cycles} insights=${insights.length} improvements=${improvements.length} ` +
    `strategies=${strategies.length} dispatched=${dispatched} ms=${durationMs}`,
  );

  return ev;
}

// ── Autonomous loop ───────────────────────────────────────────────────────────

export function startHyperCoreLoop(): void {
  if (_timer) return;
  log.info("hypercore", `starting: loop=${_loopMs}ms warmup=${_warmupMs}ms evolveEvery=${_evolveEvery} dryRun=${DRY_RUN}`);

  setTimeout(() => {
    _timer = setInterval(async () => {
      if (_paused) return;
      try {
        await evaluateSystem();
      } catch (err) {
        log.error("hypercore.loop", String(err));
      }
    }, _loopMs);
  }, _warmupMs);
}

export function stopHyperCoreLoop(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("hypercore", "stopped");
}

export function pauseHyperCoreLoop(): void  { _paused = true;  log.info("hypercore", "paused");  }
export function resumeHyperCoreLoop(): void { _paused = false; log.info("hypercore", "resumed"); }

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getRecentEvaluations(n = 10): HyperCoreEvaluation[] {
  return _evaluations.slice(-n);
}

export function hypercoreStats() {
  return {
    cycles:      _cycles,
    paused:      _paused,
    loopMs:      _loopMs,
    evolveEvery: _evolveEvery,
    dryRun:      DRY_RUN,
    evaluations: _evaluations.length,
    llmReasoner: llmReasoner.stats(),
    devopsAI:    devopsAI.stats(),
    blockchainAI: blockchainAI.stats(),
    swarm:       swarmController.stats(),
    evolution:   evolutionEngine.stats(),
  };
}
