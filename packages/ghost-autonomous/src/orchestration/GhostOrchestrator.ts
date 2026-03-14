import { Logger } from "@ghostchain/devkit";
import { GhostNodeScaler } from "../scaling/GhostNodeScaler.js";
import { GhostValidatorSupervisor } from "../validators/GhostValidatorSupervisor.js";
import { GhostHealthMonitor } from "../monitoring/GhostHealthMonitor.js";
import type { NodeConfig } from "../validators/GhostValidatorSupervisor.js";

const log = Logger.create("Orchestrator");

export interface OrchestratorConfig {
  nodes: NodeConfig[];
  scalingMetrics?: Record<string, number>;
  loopIntervalMs?: number;
}

export class GhostOrchestrator {
  private readonly scaler     = new GhostNodeScaler();
  private readonly supervisor = new GhostValidatorSupervisor();
  private readonly health     = new GhostHealthMonitor();

  async run(cfg: OrchestratorConfig): Promise<void> {
    const interval = cfg.loopIntervalMs ?? 30_000;
    log.info(`Orchestrator starting (interval=${interval}ms, nodes=${cfg.nodes.length})`);

    // Single orchestration pass
    await this.tick(cfg);

    // Loop
    setInterval(() => { void this.tick(cfg); }, interval);
  }

  private async tick(cfg: OrchestratorConfig): Promise<void> {
    log.debug("Orchestrator tick");
    await Promise.all([
      this.runScaling(cfg.scalingMetrics),
      this.runValidatorCheck(cfg.nodes),
      this.runHealthCheck(),
    ]);
  }

  private async runScaling(metrics: Record<string, number> = {}): Promise<void> {
    const eval_ = this.scaler.evaluate(metrics);
    if (eval_.decision !== "stable") {
      log.warn(`Scaling decision: ${eval_.decision} — ${eval_.reason}`);
    }
  }

  private async runValidatorCheck(nodes: NodeConfig[]): Promise<void> {
    if (nodes.length === 0) return;
    await this.supervisor.monitor(nodes);
  }

  private async runHealthCheck(): Promise<void> {
    const h = await this.health.check();
    const down = [h.rpc, h.validators, h.bridges].filter((v) => !v).length;
    if (down > 0) log.warn(`Health: ${down} subsystem(s) down`);
  }
}
