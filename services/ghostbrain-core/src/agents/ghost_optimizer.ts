/**
 * GhostOptimizer Agent
 *
 * Continuously monitors resource utilisation and applies optimisations
 * through the orchestration layer.  Runs as a named GhostBrain agent.
 *
 * Responsibilities:
 *  - Poll resource scheduler for over/under-utilised nodes
 *  - Trigger rebalancing via load_balancer
 *  - Report opportunities to self_evolution_engine for learning
 */

import { getTopLearnedPatterns, autonomously_execute } from "../task_learning_engine.js";
import { analyzePatterns, getCriticalPatterns }         from "../pattern_analyzer.js";
import { store_event }                                   from "../memory_engine.js";
import { log }                                           from "../observability/event_logger.js";

export interface GhostOptimizerConfig {
  intervalMs?: number;
  dryRun?:     boolean;
}

export class GhostOptimizer {
  readonly name  = "GhostOptimizer";
  private readonly dry:  boolean;
  private interval:      ReturnType<typeof setInterval> | null = null;
  private cycles = 0;

  constructor(cfg: GhostOptimizerConfig = {}) {
    this.dry = cfg.dryRun ?? (process.env.GHOST_OPTIMIZER_DRY_RUN === "1");
    const ms  = cfg.intervalMs ?? Number(process.env.GHOST_OPTIMIZER_INTERVAL_MS ?? "60000");
    log.info("ghost_optimizer: init", `intervalMs=${ms} dry=${this.dry}`);
    this.interval = setInterval(() => void this.tick(), ms);
  }

  async tick(): Promise<void> {
    this.cycles++;
    log.debug("ghost_optimizer: tick", `cycle=${this.cycles}`);

    const criticals = getCriticalPatterns();
    for (const pattern of criticals.slice(0, 3)) {
      store_event({
        category:   "orchestrator",
        label:      "optimizer_alert",
        resourceId: pattern.resourceId ?? "unknown",
        layer:      "service",
        severity:   "warning",
        payload:    { analysisType: pattern.analysisType, description: pattern.description },
      });

      if (!this.dry && pattern.resourceId) {
        const proposal = await autonomously_execute(pattern.resourceId, `critical:${pattern.analysisType}`);
        if (proposal) {
          log.info("ghost_optimizer: proposal", `resourceId=${pattern.resourceId} action=${proposal.action} dry=${proposal.dryRun}`);
        }
      }
    }
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  stats() { return { name: this.name, cycles: this.cycles, dry: this.dry }; }
}
