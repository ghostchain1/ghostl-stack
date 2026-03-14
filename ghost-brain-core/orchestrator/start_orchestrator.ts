/**
 * GhostBrain Global Orchestrator — Entry Point
 *
 * Wires all orchestrator subsystems and starts the control loop.
 *
 * Startup order
 * -------------
 * 1. NodeRegistry + RegionIndex (in-memory stores — zero I/O)
 * 2. AutoScaler, WorkloadBalancer, ValidatorAllocator, RoutingEngine
 * 3. LatencyMonitor, FailoverManager, CrossRegionConsensus
 * 4. ServiceDiscovery (starts polling supervisor API immediately)
 * 5. RegionManagers from ORCHESTRATOR_REGIONS env var
 * 6. GlobalController (starts tick loop, registers SIGTERM/SIGINT)
 *
 * Environment variables expected
 * --------------------------------
 * ORCHESTRATOR_REGIONS   JSON array of RegionBootstrap objects (see below)
 * SUPERVISOR_API_URL     Default: http://localhost:9100
 * SIGNING_RELAY_URL      Default: http://localhost:7910
 */

import { NodeRegistry }        from "./discovery/node_registry.js";
import { RegionIndex }         from "./discovery/region_index.js";
import { ServiceDiscovery }    from "./discovery/service_discovery.js";
import { AutoScaler }          from "./scaling/autoscaler.js";
import { WorkloadBalancer }    from "./scaling/workload_balancer.js";
import { ValidatorAllocator }  from "./scaling/validator_allocator.js";
import { RoutingEngine }       from "./networking/routing_engine.js";
import { LatencyMonitor }      from "./networking/latency_monitor.js";
import { FailoverManager }     from "./networking/failover_manager.js";
import { CrossRegionConsensus }from "./governance/cross_region_consensus.js";
import { RegionManager }       from "./control/region_manager.js";
import { GlobalController }    from "./control/global_controller.js";

// ---------------------------------------------------------------------------
// RegionBootstrap — shape of entries in ORCHESTRATOR_REGIONS
// ---------------------------------------------------------------------------

interface RegionBootstrap {
  id:             string;
  name:           string;
  primaryL1Host:  string;
  primaryL2Host:  string;
  primaryL3Host:  string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SAFE_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/;
const SAFE_ID_RE   = /^[a-zA-Z0-9_\-]{1,64}$/;

function validateBootstrap(raw: unknown): RegionBootstrap[] {
  if (!Array.isArray(raw)) {
    throw new Error("ORCHESTRATOR_REGIONS must be a JSON array");
  }

  return raw.map((entry: unknown, idx: number) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`ORCHESTRATOR_REGIONS[${idx}] is not an object`);
    }
    const e = entry as Record<string, unknown>;

    function str(key: string): string {
      const v = e[key];
      if (typeof v !== "string" || v.length === 0) {
        throw new Error(`ORCHESTRATOR_REGIONS[${idx}].${key} is missing`);
      }
      return v;
    }

    const id   = str("id");
    const name = str("name");
    const primaryL1Host = str("primaryL1Host");
    const primaryL2Host = str("primaryL2Host");
    const primaryL3Host = str("primaryL3Host");

    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`ORCHESTRATOR_REGIONS[${idx}].id contains invalid chars`);
    }
    for (const [k, v] of [
      ["primaryL1Host", primaryL1Host],
      ["primaryL2Host", primaryL2Host],
      ["primaryL3Host", primaryL3Host],
    ] as const) {
      if (!SAFE_HOST_RE.test(v)) {
        throw new Error(
          `ORCHESTRATOR_REGIONS[${idx}].${k} is not a safe hostname: ${v}`,
        );
      }
    }

    return { id, name, primaryL1Host, primaryL2Host, primaryL3Host };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Core in-memory stores.
  const registry    = new NodeRegistry();
  const regionIndex = new RegionIndex(registry);

  // 2. Stateless compute layers.
  const autoScaler  = new AutoScaler();
  const workloadBal = new WorkloadBalancer(registry);
  const validAlloc  = new ValidatorAllocator(registry, regionIndex);
  const router      = new RoutingEngine(registry, regionIndex, workloadBal);

  // 3. Networked components.
  const latencyMon  = new LatencyMonitor(registry, regionIndex);
  const failoverMgr = new FailoverManager(registry, router);
  const consensusMon= new CrossRegionConsensus(regionIndex);

  // 4. Service discovery — polls supervisor API.
  // Region IDs are not known until bootstraps are parsed; we pass an empty
  // list here and let discovery populate the registry as nodes report in.
  const discovery = new ServiceDiscovery(registry, []);
  discovery.start();

  // 5. Parse + validate region definitions from env.
  const regionsRaw = process.env["ORCHESTRATOR_REGIONS"] ?? "[]";
  let bootstraps: RegionBootstrap[];
  try {
    bootstraps = validateBootstrap(JSON.parse(regionsRaw));
  } catch (err) {
    console.error("[orchestrator] Invalid ORCHESTRATOR_REGIONS:", err);
    process.exit(1);
  }

  if (bootstraps.length === 0) {
    console.warn(
      "[orchestrator] No regions configured in ORCHESTRATOR_REGIONS — " +
      "service discovery will still register nodes",
    );
  }

  // 6. Build RegionManager instances.
  const regionManagers = bootstraps.map(
    b => new RegionManager(b.id, b.name, registry, autoScaler),
  );

  // 7. GlobalController — orchestrates tick loop + graceful shutdown.
  const controller = new GlobalController();

  // Register all region managers.
  for (const mgr of regionManagers) {
    controller.register(mgr);
  }

  // Wire LatencyMonitor, FailoverManager, CrossRegionConsensus into the tick
  // cycle via the onTick callback so they run after each region health check.
  controller.onTick = async (_result) => {
    await latencyMon.probeAll().catch(() => void 0);
    await failoverMgr.evaluate().catch(() => void 0);
    await consensusMon.check().catch(() => void 0);
    validAlloc.allocateAll();
  };

  // Expose helper references for external health checks (reachable by other
  // modules that import start_orchestrator.ts as a module, not a script).
  void {
    route:          router.route.bind(router),
    balance:        workloadBal.balance.bind(workloadBal),
    allocateAll:    validAlloc.allocateAll.bind(validAlloc),
    regionStates:   () => regionIndex.rankedRegions(),
    consensusCheck: consensusMon.check.bind(consensusMon),
  };

  console.info(
    "[orchestrator] Starting GhostBrain Global Orchestrator …" +
    ` regions=${bootstraps.length}`,
  );

  controller.start();
}

main().catch(err => {
  console.error("[orchestrator] Fatal startup error:", err);
  process.exit(1);
});
