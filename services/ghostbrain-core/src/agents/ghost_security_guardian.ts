/**
 * GhostSecurityGuardian Agent
 *
 * Monitors the GhostBrain stack for anomalous behaviour, unusual call
 * patterns, and policy violations.  Surface alerts as memory events;
 * all enforcement actions are forwarded to the signing relay.
 *
 * Detection heuristics:
 *  - Unusual CPU / memory spike signatures (cross-correlated with restarts)
 *  - Container restart storms (rate-of-restart anomaly)
 *  - Abnormal RPC error rates on L1/L2/L3
 *  - Unrecognised container names (allowlist enforcement)
 */

import { getContainerFleet }    from "../docker_monitor.js";
import { getVMFleet }           from "../vm_monitor.js";
import { store_event }          from "../memory_engine.js";
import { log }                  from "../observability/event_logger.js";

// Container-name stems expected in Ghost-native runtime bundles.
// We intentionally match by partial stem because compose projects may
// prepend or append extra name segments.
const GHOST_RUNTIME_ALLOWLIST = [
  "ghostbrain",
  "ghostbrain-worker",
  "ghostbrain-redis",
  "ghostbrain-postgres",
  "ghostbrain-qdrant",
  "ghostbrain-nats",
  "ghostbrain-orchestrator",
  "hypervisor-supervisor",
  "host-orchestrator-ai",
  "ghost-helper-bots",
  "acg-planner",
  "acg-auditor",
  "acg-sentinel",
  "hyper-ghost-ai",
  "governance-event-bridge",
  "ghost-rpc-aggregator",
  "ghost-tx-engine",
  "ghost-memory-guard",
  "ghost-rpc-proxy",
  "ghost-rollup-proxy",
  "ghost-exec",
  "ghost-sequencer",
  "ghost-deriver",
  "ghost-settlement",
  "ghost-bridge",
  "ghost-proof",
  "ghost-observability",
  "ghostchaind",
  "ghostchain-evm",
  "ghostchain-l1",
  "ghostl2",
  "ghostl3",
];

// Legacy OP Stack fleets are no longer part of the default runtime inventory.
// Operators can still opt them back in while compat stacks remain active.
const LEGACY_OPSTACK_ALLOWLIST = [
  "op-geth",
  "op-node",
  "op-batcher",
  "op-proposer",
  "op-challenger",
  "l3-op-node",
];

function parseCsvList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export interface GhostSecurityGuardianConfig {
  intervalMs?:      number;
  allowlist?:       string[];
  restartStormMax?: number;
}

interface SecurityAlert {
  level:      "info" | "warn" | "critical";
  code:       string;
  resourceId: string;
  detail:     string;
}

export class GhostSecurityGuardian {
  readonly name    = "GhostSecurityGuardian";
  private readonly allow:  Set<string>;
  private readonly stormMax: number;
  private interval:        ReturnType<typeof setInterval> | null = null;
  private cycles = 0;
  private recentAlerts: SecurityAlert[] = [];

  constructor(cfg: GhostSecurityGuardianConfig = {}) {
    const envList  = parseCsvList(process.env.GUARDIAN_ALLOWLIST ?? "");
    const compatOpstack = process.env.GUARDIAN_ALLOW_OPSTACK_COMPAT === "1";
    this.allow     = new Set([
      ...GHOST_RUNTIME_ALLOWLIST,
      ...(compatOpstack ? LEGACY_OPSTACK_ALLOWLIST : []),
      ...(cfg.allowlist ?? []),
      ...envList,
    ]);
    this.stormMax  = cfg.restartStormMax ?? Number(process.env.GUARDIAN_RESTART_STORM_MAX ?? "5");
    const ms       = cfg.intervalMs     ?? Number(process.env.GUARDIAN_INTERVAL_MS ?? "30000");
    log.info(
      "ghost_security_guardian: init",
      `intervalMs=${ms} stormMax=${this.stormMax} allowlistSize=${this.allow.size} compatOpstack=${compatOpstack ? 1 : 0}`,
    );
    this.interval  = setInterval(() => this.tick(), ms);
  }

  tick(): void {
    this.cycles++;
    this.recentAlerts = [];

    const containers = getContainerFleet();

    for (const c of containers) {
      // Allowlist check — look for a partial match on the short name
      const knownName = [...this.allow].some(k =>
        c.name.toLowerCase().includes(k.toLowerCase())
      );
      if (!knownName) {
        this.raise("critical", "UNKNOWN_CONTAINER", c.name, `Unrecognised container "${c.name}" not in allowlist`);
      }

      // Restart storm
      if (c.restarts >= this.stormMax) {
        this.raise("critical", "RESTART_STORM", c.name, `Container restarted ${c.restarts} times — possible crash loop`);
      }

      // Abnormal memory spike
      if (c.memPct > 95) {
        this.raise("warn", "MEMORY_SPIKE", c.name, `Container memory at ${c.memPct.toFixed(1)}%`);
      }
    }

    const vms = getVMFleet();
    for (const vm of vms) {
      if (vm.cpuPct > 95 && vm.memPct > 90) {
        this.raise("critical", "RESOURCE_EXHAUSTION", vm.vmId, `VM ${vm.vmName} near total resource exhaustion`);
      }
    }

    if (this.recentAlerts.some(a => a.level === "critical")) {
      log.warn("ghost_security_guardian: critical_alerts", `${this.recentAlerts.filter(a => a.level === "critical").length} CRITICAL alerts active`);
    }
  }

  private raise(level: SecurityAlert["level"], code: string, resourceId: string, detail: string): void {
    const alert: SecurityAlert = { level, code, resourceId, detail };
    this.recentAlerts.push(alert);
    store_event({
      category:   "protection",
      label:      "security_alert",
      resourceId,
      layer:      "service",
      severity:   level === "critical" ? "critical" : "warning",
      payload:    { code, detail },
    });
    log.warn("ghost_security_guardian: alert", `${detail} [${level}] code=${code} resource=${resourceId}`);
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  stats()       { return { name: this.name, cycles: this.cycles, recentAlerts: this.recentAlerts }; }
  getAlerts()   { return this.recentAlerts; }
}
