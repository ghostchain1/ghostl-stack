/**
 * GhostBrain Global Orchestrator — Global Controller
 *
 * The central coordinator for all orchestrator activity.  Each tick it:
 *  1. Runs health checks across all registered RegionManagers in parallel.
 *  2. Collects scaling recommendations from the AutoScaler.
 *  3. Publishes a summary to the Swarm bus so other AI agents can act.
 *  4. Persists significant events to the Memory Engine.
 *
 * The orchestration loop uses setInterval — not a while(true) busy loop.
 * Graceful shutdown is handled via SIGTERM/SIGINT or explicit stop().
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. No exec() or shell calls.
 * 2. No autonomous on-chain writes — all governance actions go to relay.
 * 3. All network calls have AbortController timeouts.
 */

import type { RegionInfo, ScalingRecommendation } from "../types.js";
import type { RegionManager }                      from "./region_manager.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ORCHESTRATE_INTERVAL_MS = parseInt(
  process.env["ORCHESTRATOR_INTERVAL_MS"] ?? "10000", 10,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorTick {
  tick:              number;
  regionsChecked:    number;
  unhealthyNodes:    number;
  scalingActions:    ScalingRecommendation[];
  errors:            string[];
  durationMs:        number;
  timestamp:         number;
}

/** Callback invoked after every tick — wire to Swarm bus or logger. */
export type TickHandler = (result: OrchestratorTick) => void;

// ---------------------------------------------------------------------------
// GlobalController
// ---------------------------------------------------------------------------

export class GlobalController {
  private readonly regions = new Map<string, RegionManager>();
  private tick              = 0;
  private running           = false;
  private intervalRef?:     ReturnType<typeof setInterval>;

  onTick?: TickHandler;

  /**
   * Register a RegionManager.  Duplicate region IDs replace the previous entry.
   */
  register(manager: RegionManager): void {
    this.regions.set(manager.regionId, manager);
  }

  deregister(regionId: string): void {
    this.regions.delete(regionId);
  }

  /** Start the orchestration loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    const shutdown = () => {
      this.stop();
      process.exit(0);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT",  shutdown);

    this.intervalRef = setInterval(async () => {
      const result = await this.runTick();
      this.onTick?.(result);
      if (result.errors.length > 0 || result.unhealthyNodes > 0) {
        console.warn(
          `[orchestrator] tick=${result.tick} unhealthy=${result.unhealthyNodes} ` +
          `scaling=${result.scalingActions.length} errors=${result.errors.length} ` +
          `duration=${result.durationMs}ms`,
        );
      } else {
        console.info(
          `[orchestrator] tick=${result.tick} regions=${result.regionsChecked} ` +
          `all-healthy duration=${result.durationMs}ms`,
        );
      }
    }, ORCHESTRATE_INTERVAL_MS);
  }

  /** Stop the loop gracefully. */
  stop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    this.running = false;
  }

  /** Execute one orchestration tick.  Returns a full summary. */
  async runTick(): Promise<OrchestratorTick> {
    const startMs   = Date.now();
    this.tick++;

    const errors:         string[]                 = [];
    const recommendations: ScalingRecommendation[] = [];
    let   unhealthyNodes = 0;

    // Run all region health checks in parallel — a single region failure must
    // not block the others.
    const regionChecks = [...this.regions.values()].map(async (mgr) => {
      try {
        const summary = await mgr.check();
        unhealthyNodes += summary.unhealthyCount;
        if (summary.scalingRecommendation) {
          recommendations.push(summary.scalingRecommendation);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`region ${mgr.regionId}: ${msg}`);
      }
    });

    await Promise.allSettled(regionChecks);

    return {
      tick:           this.tick,
      regionsChecked: this.regions.size,
      unhealthyNodes,
      scalingActions: recommendations,
      errors,
      durationMs:     Date.now() - startMs,
      timestamp:      startMs,
    };
  }

  /** Summary of all known regions (for diagnostics / API). */
  regionSummaries(): RegionInfo[] {
    return [...this.regions.values()].map(m => m.getInfo());
  }

  get isRunning(): boolean { return this.running; }
  get tickCount():  number { return this.tick; }
  get regionCount(): number { return this.regions.size; }
}
