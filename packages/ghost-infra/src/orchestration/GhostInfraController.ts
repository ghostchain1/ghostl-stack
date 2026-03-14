import { Logger }                      from "@ghostchain/devkit";
import { GhostVMManager }              from "../hypervisor/GhostVMManager.js";
import { GhostContainerOrchestrator }  from "../docker/GhostContainerOrchestrator.js";
import { GhostNetworkController }      from "../networking/GhostNetworkController.js";
import { GhostLoadBalancer }           from "../networking/GhostLoadBalancer.js";
import { GhostStorageManager }         from "../storage/GhostStorageManager.js";
import { GhostDomainController }       from "../domains/GhostDomainController.js";
import type { ServiceSpec }            from "../docker/GhostContainerOrchestrator.js";
import type { Upstream }              from "../networking/GhostLoadBalancer.js";
import type { VMPool }                from "../hypervisor/GhostVMManager.js";

const log = Logger.create("GhostInfraController");

// ─── Configuration ────────────────────────────────────────────────────────────

export interface InfraNode {
  name: string;
  role: "validator" | "rpc" | "bridge" | "worker" | "generic";
  vmPool?: string;
}

export interface InfraConfig {
  /** VM pools managed by libvirt. */
  vmPools?: VMPool[];
  /** Docker services to manage. */
  services?: ServiceSpec[];
  /** HAProxy / nginx upstream pools. */
  upstreams?: Upstream[];
  /** Disk paths to monitor for high usage. */
  monitorPaths?: string[];
  /** Disk usage alert threshold (default 85 %). */
  diskAlertPct?: number;
  /** Tick interval in milliseconds (default 60 s). */
  intervalMs?: number;
  /** Stack root for docker compose operations. */
  stackRoot?: string;
  /** /etc/hosts fallback domain entries to seed. */
  seedHosts?: Array<{ name: string; ip: string }>;
}

// ─── Main controller ──────────────────────────────────────────────────────────

/**
 * GhostInfraController — the AI brain for GhostChain infrastructure.
 *
 * Runs a periodic tick loop that:
 *  • auto-heals VMs via GhostVMManager
 *  • evaluates and applies container scaling via GhostContainerOrchestrator
 *  • prunes unused Docker volumes via GhostStorageManager
 *  • alerts on high-disk paths
 *
 * All sub-controllers are exposed for direct use from calling code.
 */
export class GhostInfraController {
  readonly vm:         GhostVMManager;
  readonly containers: GhostContainerOrchestrator;
  readonly network:    GhostNetworkController;
  readonly lb:         GhostLoadBalancer;
  readonly storage:    GhostStorageManager;
  readonly domains:    GhostDomainController;

  private cfg: InfraConfig = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: {
    lbConfigPath?: string;
    lbBackend?:    "haproxy" | "nginx";
    ghostbrainApi?: string;
  } = {}) {
    this.vm         = new GhostVMManager();
    this.containers = new GhostContainerOrchestrator(opts.ghostbrainApi);
    this.network    = new GhostNetworkController();
    this.lb         = new GhostLoadBalancer({
      configPath: opts.lbConfigPath,
      backend:    opts.lbBackend,
    });
    this.storage    = new GhostStorageManager();
    this.domains    = new GhostDomainController({ apiBase: opts.ghostbrainApi });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  /**
   * Configure all sub-systems and start the autonomous tick loop.
   */
  async run(cfg: InfraConfig = {}): Promise<void> {
    this.cfg     = cfg;
    this.running = true;

    log.info("GhostInfraController starting…");
    await this.configure(cfg);

    const intervalMs = cfg.intervalMs ?? 60_000;
    log.info(`Tick loop started — interval: ${intervalMs}ms`);

    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        log.error(`Tick error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, intervalMs);

    // First tick immediately
    await this.tick();
  }

  /** Stop the tick loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    log.info("GhostInfraController stopped");
  }

  // ─── Configuration bootstrap ─────────────────────────────────────

  private async configure(cfg: InfraConfig): Promise<void> {
    // Register VM pools
    for (const pool of cfg.vmPools ?? []) {
      this.vm.definePool(pool);
    }

    // Register compose services
    for (const svc of cfg.services ?? []) {
      this.containers.registerService(svc);
    }

    // Register LB upstreams
    for (const upstream of cfg.upstreams ?? []) {
      this.lb.addUpstream(upstream);
    }

    // Seed /etc/hosts entries
    for (const entry of cfg.seedHosts ?? []) {
      await this.domains.addRecord({ name: entry.name, ip: entry.ip }).catch((err: unknown) => {
        log.warn(`Seed host failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    log.info("Configuration applied");
  }

  // ─── Tick ────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const startMs = Date.now();
    log.info("── tick ──");

    await Promise.allSettled([
      this.tickVMs(),
      this.tickContainers(),
      this.tickStorage(),
    ]);

    log.info(`── tick done in ${Date.now() - startMs}ms ──`);
  }

  private async tickVMs(): Promise<void> {
    try {
      await this.vm.autoHeal();
      await this.vm.enforcePoolMinimums();
    } catch (err) {
      log.error(`VM tick: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async tickContainers(): Promise<void> {
    try {
      const actions = await this.containers.evaluate();
      if (actions.length > 0) {
        log.info(`Container actions: ${actions.length}`);
        await this.containers.applyActions(actions);
      }
    } catch (err) {
      log.error(`Container tick: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async tickStorage(): Promise<void> {
    try {
      const paths = this.cfg.monitorPaths ?? ["/", "/var/lib/docker"];
      const threshold = this.cfg.diskAlertPct ?? 85;
      const high = await this.storage.highUsagePaths(paths, threshold);
      for (const d of high) {
        log.warn(`HIGH DISK USAGE: ${d.path} at ${d.usedPercent}% (${d.usedGiB}/${d.totalGiB} GiB)`);
      }
    } catch (err) {
      log.error(`Storage tick: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  isRunning(): boolean {
    return this.running;
  }
}
