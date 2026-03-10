/**
 * GhostPredictor Agent
 *
 * Uses the predictive subsystem (failure_predictor + pattern_recognition)
 * to forecast failures and surface early warnings.
 */

import { getRisksForResource } from "../predictive/failure_predictor.js";
import { getContainerFleet }      from "../docker_monitor.js";
import { getVMFleet }             from "../vm_monitor.js";
import { store_event }            from "../memory_engine.js";
import { log }                    from "../observability/event_logger.js";

export interface GhostPredictorConfig {
  intervalMs?:         number;
  failureScoreThreshold?: number;
}

interface FailureWarning {
  resourceId:   string;
  layer:        "container" | "vm";
  probability:  number;
  horizon:      string;
  reason:       string;
}

export class GhostPredictor {
  readonly name          = "GhostPredictor";
  private readonly threshold:    number;
  private interval:              ReturnType<typeof setInterval> | null = null;
  private cycles = 0;
  private warnings: FailureWarning[] = [];

  constructor(cfg: GhostPredictorConfig = {}) {
    this.threshold = cfg.failureScoreThreshold ?? Number(process.env.GHOST_PREDICTOR_THRESHOLD ?? "0.6");
    const ms        = cfg.intervalMs           ?? Number(process.env.GHOST_PREDICTOR_INTERVAL_MS ?? "60000");
    log.info("ghost_predictor: init", `intervalMs=${ms} threshold=${this.threshold}`);
    this.interval   = setInterval(() => this.tick(), ms);
  }

  tick(): void {
    this.cycles++;
    this.warnings = [];

    const containers = getContainerFleet();
    const vms        = getVMFleet();

    for (const c of containers) {
      const risks = getRisksForResource(c.name);
      const score = risks.length > 0 ? (risks[0]?.score ?? 0) : 0;
      if (score >= this.threshold) {
        this.warnings.push({ resourceId: c.name, layer: "container", probability: score, horizon: "15 min", reason: "Predictive model triggered" });
        store_event({
          category:   "protection",
          label:      "failure_prediction",
          resourceId: c.name,
          layer:      "container",
          severity:   score > 0.85 ? "critical" : "warning",
          payload:    { score, horizon: "15 min" },
        });
      }
    }

    for (const vm of vms) {
      const risks = getRisksForResource(vm.vmId);
      const score = risks.length > 0 ? (risks[0]?.score ?? 0) : 0;
      if (score >= this.threshold) {
        this.warnings.push({ resourceId: vm.vmId, layer: "vm", probability: score, horizon: "30 min", reason: "Predictive model triggered" });
        store_event({
          category:   "protection",
          label:      "failure_prediction",
          resourceId: vm.vmId,
          layer:      "vm",
          severity:   score > 0.85 ? "critical" : "warning",
          payload:    { score, horizon: "30 min" },
        });
      }
    }

    if (this.warnings.length > 0) {
      log.warn("ghost_predictor: warnings", `${this.warnings.length} failure predictions raised`);
    }
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  stats()       { return { name: this.name, cycles: this.cycles, threshold: this.threshold, activeWarnings: this.warnings }; }
  getWarnings() { return this.warnings; }
}
