import { ProcessRunner, Logger } from "@ghostchain/devkit";
import { GhostHypervisorController } from "./GhostHypervisorController.js";
import type { VMInfo, VMCreateOptions } from "./GhostHypervisorController.js";

const log = Logger.create("VMManager");

export interface VMHealth {
  name: string;
  healthy: boolean;
  state: string;
  actions: string[];
}

export interface VMPool {
  tag: string;
  vms: string[];
  minRunning: number;
}

/**
 * GhostVMManager — high-level VM lifecycle management with auto-heal.
 * Wraps GhostHypervisorController with policy enforcement.
 */
export class GhostVMManager {
  private readonly hv: GhostHypervisorController;
  private readonly pools = new Map<string, VMPool>();

  constructor(uri?: string) {
    this.hv = new GhostHypervisorController(uri);
  }

  /** Define a managed VM pool. */
  definePool(pool: VMPool): void {
    this.pools.set(pool.tag, pool);
    log.info(`Pool "${pool.tag}" defined: [${pool.vms.join(", ")}] minRunning=${pool.minRunning}`);
  }

  /** Health-check all VMs and return status. */
  async healthCheck(): Promise<VMHealth[]> {
    const all = await this.hv.list();
    const results: VMHealth[] = [];

    for (const vm of all) {
      const actions: string[] = [];
      const healthy = vm.state === "running";
      if (!healthy) actions.push(`state=${vm.state} — needs start`);
      results.push({ name: vm.name, healthy, state: vm.state, actions });
    }

    const unhealthy = results.filter((r) => !r.healthy).length;
    if (unhealthy > 0) log.warn(`VM health: ${unhealthy}/${results.length} unhealthy`);
    return results;
  }

  /** Auto-heal: restart any stopped VMs that are part of a managed pool. */
  async autoHeal(): Promise<void> {
    log.info("Running VM auto-heal");
    const health = await this.healthCheck();
    const managedNames = new Set([...this.pools.values()].flatMap((p) => p.vms));

    for (const vm of health) {
      if (!managedNames.has(vm.name)) continue;
      if (vm.healthy) continue;

      log.warn(`Auto-healing ${vm.name} (${vm.state})`);
      try {
        await this.hv.start(vm.name);
        log.info(`${vm.name} started`);
      } catch (err) {
        log.error(`Failed to start ${vm.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** Enforce pool minimums: start VMs if below minRunning. */
  async enforcePoolMinimums(): Promise<void> {
    for (const pool of this.pools.values()) {
      const infos: VMInfo[] = await Promise.all(pool.vms.map((n) => this.hv.info(n)));
      const running = infos.filter((v) => v.state === "running").length;
      const needed  = pool.minRunning - running;

      if (needed <= 0) continue;

      log.warn(`Pool "${pool.tag}": ${running}/${pool.minRunning} running — starting ${needed}`);
      const stopped = infos.filter((v) => v.state === "stopped").slice(0, needed);
      for (const vm of stopped) {
        await this.hv.start(vm.name).catch((e) =>
          log.error(`Cannot start ${vm.name}: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    }
  }

  /** Provision a new VM and add it to a pool. */
  async provision(pool: string, opts: VMCreateOptions): Promise<void> {
    log.info(`Provisioning ${opts.name} into pool "${pool}"`);
    await this.hv.create(opts);
    await this.hv.start(opts.name);
    const p = this.pools.get(pool);
    if (p) p.vms.push(opts.name);
  }

  /** Deprovision and remove a VM from its pool. */
  async deprovision(name: string): Promise<void> {
    log.warn(`Deprovisioning ${name}`);
    try { await this.hv.stop(name, true); } catch { /* already stopped */ }
    await this.hv.delete(name, true);
    for (const p of this.pools.values()) {
      const idx = p.vms.indexOf(name);
      if (idx !== -1) p.vms.splice(idx, 1);
    }
  }

  get hypervisor(): GhostHypervisorController {
    return this.hv;
  }
}
