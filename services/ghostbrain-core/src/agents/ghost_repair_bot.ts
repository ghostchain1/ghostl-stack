/**
 * GhostRepairBot Agent
 *
 * Watches failure predictions and patterns, then invokes the autonomous
 * repair engine to fix problems before they become critical.
 */

import { getUnhealthyContainers } from "../docker_monitor.js";
import { getUnhealthyVMs }        from "../vm_monitor.js";
import { executeRepair }          from "../auto_repair_engine.js";
import { store_event }            from "../memory_engine.js";
import { log }                    from "../observability/event_logger.js";

export interface GhostRepairBotConfig {
  intervalMs?: number;
  dryRun?:     boolean;
}

export class GhostRepairBot {
  readonly name = "GhostRepairBot";
  private readonly dry: boolean;
  private interval:     ReturnType<typeof setInterval> | null = null;
  private repairCount = 0;
  private cycles      = 0;

  constructor(cfg: GhostRepairBotConfig = {}) {
    this.dry = cfg.dryRun ?? (process.env.GHOST_REPAIR_DRY_RUN === "1");
    const ms  = cfg.intervalMs ?? Number(process.env.GHOST_REPAIR_INTERVAL_MS ?? "30000");
    log.info("ghost_repair_bot: init", `intervalMs=${ms} dry=${this.dry}`);
    this.interval = setInterval(() => void this.tick(), ms);
  }

  async tick(): Promise<void> {
    this.cycles++;

    const badContainers = getUnhealthyContainers().slice(0, 2);
    const badVMs        = getUnhealthyVMs().slice(0, 2);

    for (const c of badContainers) {
      store_event({
        category:   "orchestrator",
        label:      "repair_trigger",
        resourceId: c.name,
        layer:      "container",
        severity:   "warning",
        payload:    { cpuPct: c.cpuPct, memPct: c.memPct, restarts: c.restarts },
      });

      const result = await executeRepair({
        resourceId:  c.name,
        layer:       "container",
        strategy:    c.restarts > 3 ? "redeploy_service" : "restart_container",
        params:      { containerId: c.id },
        triggerEvent: "unhealthy_container",
        rationale:   `Container ${c.name} is unhealthy (CPU:${c.cpuPct.toFixed(1)}% restarts:${c.restarts})`,
        confidence:  c.restarts > 5 ? 0.85 : 0.6,
        dryRun:      this.dry,
      });

      if (result.success) this.repairCount++;
      log.info("ghost_repair_bot: container_repair", `resource=${c.name} success=${result.success} dry=${result.dryRun}`);
    }

    for (const vm of badVMs) {
      store_event({
        category:   "orchestrator",
        label:      "repair_trigger",
        resourceId: vm.vmId,
        layer:      "vm",
        severity:   "warning",
        payload:    { cpuPct: vm.cpuPct, memPct: vm.memPct, state: vm.state },
      });

      const result = await executeRepair({
        resourceId:   vm.vmId,
        layer:        "vm",
        strategy:     "reallocate",
        params:       { vmName: vm.vmName, host: vm.host },
        triggerEvent: "unhealthy_vm",
        rationale:    `VM ${vm.vmName} is unhealthy (CPU:${vm.cpuPct.toFixed(1)}% MEM:${vm.memPct.toFixed(1)}%)`,
        confidence:   0.55,
        dryRun:       this.dry,
      });

      if (result.success) this.repairCount++;
      log.info("ghost_repair_bot: vm_repair", `resource=${vm.vmId} success=${result.success}`);
    }
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  stats() { return { name: this.name, cycles: this.cycles, repairCount: this.repairCount, dry: this.dry }; }
}
