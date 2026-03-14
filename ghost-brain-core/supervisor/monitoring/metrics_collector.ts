/**
 * Metrics Collector
 *
 * Aggregates metrics from all infrastructure controllers into a unified
 * MetricsSnapshot consumed by the DecisionEngine.
 */

import type { IController } from "../brain/supervisor_core.js";
import type { HypervisorManager }  from "../infrastructure/hypervisor_manager.js";
import type { VMController }        from "../infrastructure/vm_controller.js";
import type { DockerController }    from "../infrastructure/docker_controller.js";
import type { NetworkController }   from "../infrastructure/network_controller.js";
import type { MetricsSnapshot }     from "../brain/decision_engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectorConfig {
  /** Polling interval for L2 block lag, ms. Default: 10 000. */
  l2PollIntervalMs: number;
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

export class MetricsCollector implements IController {
  readonly name = "MetricsCollector";

  private readonly hypervisor: HypervisorManager;
  private readonly vms:        VMController;
  private readonly docker:     DockerController;
  private readonly network:    NetworkController;

  private latestSnapshot: MetricsSnapshot | null = null;
  private l2BlockLag = 0;

  constructor(
    hypervisor: HypervisorManager,
    vms:        VMController,
    docker:     DockerController,
    network:    NetworkController,
  ) {
    this.hypervisor = hypervisor;
    this.vms        = vms;
    this.docker     = docker;
    this.network    = network;
  }

  /** Check is a no-op here — MetricsCollector assembles data already gathered by others. */
  async check(): Promise<void> {
    this.latestSnapshot = this.assemble();
  }

  getLatestSnapshot(): MetricsSnapshot | null {
    return this.latestSnapshot;
  }

  /** Called externally when a new L2 block lag measurement is available. */
  updateL2BlockLag(lag: number): void {
    this.l2BlockLag = lag;
  }

  // ---------------------------------------------------------------------------
  // Assemble
  // ---------------------------------------------------------------------------

  private assemble(): MetricsSnapshot {
    const hvMetrics = this.hypervisor.getLatestMetrics();

    return {
      cpuLoad:               hvMetrics?.load1m ?? 0,
      memoryUsedPct:         hvMetrics?.memUsedPct ?? 0,
      unhealthyContainers:   this.docker.getUnhealthy(),
      exitedContainers:      this.docker.getExited(),
      offlineVMs:            this.vms.getLastScan()
                               .filter(v => v.state === "shut off" || v.state === "crashed")
                               .map(v => v.name),
      l2BlockLag:            this.l2BlockLag,
      degradedInterfaces:    this.network.getDegradedInterfaces(),
      riskScore:             0, // seeded by DecisionEngine via GhostBrain classify
    };
  }
}
