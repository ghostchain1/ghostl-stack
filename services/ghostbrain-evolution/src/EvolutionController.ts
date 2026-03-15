import { PerformanceAnalyzer }           from "./PerformanceAnalyzer";
import { UpgradePlanner, UpgradePlan }   from "./UpgradePlanner";
import { ExperimentEngine }              from "./ExperimentEngine";
import { EvolutionGovernor }             from "./EvolutionGovernor";

/**
 * EvolutionController — orchestrates self-evolution of the GhostStack.
 *
 * Lifecycle:
 *  1. Continuously collect performance metrics
 *  2. Detect degraded services
 *  3. Propose upgrade plans or experiments
 *  4. Submit for governor approval
 *  5. Execute approved changes
 */
export class EvolutionController {
  private perf:       PerformanceAnalyzer;
  private planner:    UpgradePlanner;
  private experiments: ExperimentEngine;
  private governor:   EvolutionGovernor;
  private running:    boolean = false;

  constructor() {
    this.perf        = new PerformanceAnalyzer();
    this.planner     = new UpgradePlanner();
    this.experiments = new ExperimentEngine();
    this.governor    = new EvolutionGovernor({ riskThreshold: "medium", minConfidence: 0.8 });
  }

  get analyzer():    PerformanceAnalyzer { return this.perf; }
  get expEngine():   ExperimentEngine    { return this.experiments; }

  async evolve(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log("[EvolutionController] Evolution cycle started");

    try {
      // Analyse all tracked services
      const degraded = this.perf
        .allServices()
        .map(s => this.perf.analyze(s))
        .filter(r => r.status !== "healthy");

      if (degraded.length === 0) {
        console.log("[EvolutionController] All services healthy — no evolution needed");
        return;
      }

      console.log(`[EvolutionController] Degraded services: ${degraded.map(d => d.service).join(", ")}`);

      // Create an upgrade plan for degraded services
      const plan: UpgradePlan = this.planner.createPlan(
        degraded.map(d => d.service),
        "rollout"
      );

      if (this.governor.approvePlan(plan)) {
        console.log(`[EvolutionController] Executing plan ${plan.id}`);
        for (const step of plan.steps) {
          console.log(`  → ${step.action} ${step.service} (risk: ${step.risk})`);
        }
      } else {
        console.warn(`[EvolutionController] Plan ${plan.id} vetoed — awaiting manual approval`);
      }

      // Check for completed experiments ready for adoption
      const completed = this.experiments.list("completed");
      for (const exp of completed) {
        if (exp.result) {
          this.governor.approveExperiment(exp, exp.result);
        }
      }
    } finally {
      this.running = false;
      console.log("[EvolutionController] Evolution cycle complete");
    }
  }
}

// Main entry point
if (require.main === module) {
  const ctrl = new EvolutionController();

  // Simulate degraded service
  ctrl.analyzer.record({
    service:     "ghostbrain-economy",
    tps:          5,
    latencyMs:   800,
    errorRate:   0.05,
    uptimeRatio: 0.97,
    timestamp:   Date.now(),
  });

  ctrl.evolve().catch(console.error);
}
