/**
 * GhostLoadBalancer Agent
 *
 * Monitors container and VM fleets for resource imbalances and proposes
 * traffic / workload rebalancing actions.
 */

import { getContainerFleet }    from "../docker_monitor.js";
import { getVMFleet }           from "../vm_monitor.js";
import { store_event, store_decision } from "../memory_engine.js";
import { log }                  from "../observability/event_logger.js";

export interface GhostLoadBalancerConfig {
  intervalMs?: number;
}

interface ImbalanceAlert {
  resourceId:  string;
  layer:       "container" | "vm";
  metric:      "cpu" | "mem";
  value:       number;
  threshold:   number;
  recommendation: string;
}

export class GhostLoadBalancer {
  readonly name = "GhostLoadBalancer";
  private interval:     ReturnType<typeof setInterval> | null = null;
  private cycles      = 0;
  private alerts: ImbalanceAlert[] = [];

  constructor(cfg: GhostLoadBalancerConfig = {}) {
    const ms = cfg.intervalMs ?? Number(process.env.GHOST_LB_INTERVAL_MS ?? "45000");
    log.info("ghost_load_balancer: init", `intervalMs=${ms}`);
    this.interval = setInterval(() => this.tick(), ms);
  }

  tick(): void {
    this.cycles++;
    this.alerts = [];

    const containers = getContainerFleet();
    const vms        = getVMFleet();

    // Detect overloaded containers
    for (const c of containers) {
      if (c.cpuPct > 85) {
        this.alerts.push({ resourceId: c.name, layer: "container", metric: "cpu", value: c.cpuPct, threshold: 85, recommendation: "Scale out or reduce CPU limits" });
      }
      if (c.memPct > 90) {
        this.alerts.push({ resourceId: c.name, layer: "container", metric: "mem", value: c.memPct, threshold: 90, recommendation: "Increase memory allocation or shed load" });
      }
    }

    // Detect overloaded VMs
    for (const vm of vms) {
      if (vm.cpuPct > 80) {
        this.alerts.push({ resourceId: vm.vmId, layer: "vm", metric: "cpu", value: vm.cpuPct, threshold: 80, recommendation: "Migrate workload to under-utilised VM" });
      }
      if (vm.memPct > 88) {
        this.alerts.push({ resourceId: vm.vmId, layer: "vm", metric: "mem", value: vm.memPct, threshold: 88, recommendation: "Free memory or reallocate workloads" });
      }
    }

    for (const alert of this.alerts) {
      store_event({
        category:   "orchestrator",
        label:      "load_imbalance",
        resourceId: alert.resourceId,
        layer:      alert.layer,
        severity:   alert.value > 95 ? "critical" : "warning",
        payload:    { metric: alert.metric, value: alert.value, threshold: alert.threshold },
      });
    }

    if (this.alerts.length > 0) {
      store_decision({
        agent:        this.name,
        decisionType: "load_rebalance",
        resourceId:   "fleet",
        layer:        "service",
        rationale:    `${this.alerts.length} imbalance alert(s) detected`,
        confidence:   0.75,
        actionTaken:  { alerts: this.alerts.length, resources: this.alerts.map(a => a.resourceId) },
        requiresHuman: false,
        policyGuard:  "ALLOW",
      });
    }

    log.debug("ghost_load_balancer: tick", `cycle=${this.cycles} alerts=${this.alerts.length}`);
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  stats()         { return { name: this.name, cycles: this.cycles, currentAlerts: this.alerts }; }
  getAlerts()     { return this.alerts; }
}
