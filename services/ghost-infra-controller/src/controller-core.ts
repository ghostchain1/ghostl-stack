/**
 * Infrastructure Controller Core
 *
 * Orchestrates the full autonomous self-healing loop:
 *
 *   1. analyzeSystem        — CPU, memory, VMs, containers, nodes, network, disks
 *   2. manageHypervisor     — virsh health check
 *   3. manageVMs            — start stopped/crashed ghost VMs
 *   4. manageContainers     — restart unhealthy/exited ghost containers
 *   5. manageNodes          — detect sync lag / unreachable nodes
 *   6. manageNetwork        — latency / unreachable endpoint alerts
 *   7. manageDNS            — scheduled Bind9 reload
 *   8. monitorStorage       — disk space expansion proposals
 *   9. (implicit) scaling   — scale-up/down proposals from system metrics
 *
 * Actions with autoExecute=true (VM start, container restart, DNS reload)
 * are executed in-process when ALLOW_AUTO_EXEC=true && DRY_RUN=false.
 * All other actions are logged as proposals for human ratification.
 */
import { randomUUID }          from "node:crypto";
import { analyzeSystem }       from "./analyzers/system-analyzer.js";
import { manageHypervisor }    from "./modules/hypervisor-manager.js";
import { manageVMs }           from "./modules/vm-manager.js";
import { manageContainers }    from "./modules/docker-manager.js";
import { manageNodes }         from "./modules/node-manager.js";
import { manageNetwork }       from "./modules/network-manager.js";
import { manageDNS }           from "./modules/dns-manager.js";
import { monitorStorage }      from "./modules/storage-manager.js";
import { SCALING_POLICY, shouldScaleUp, shouldScaleDown } from "./policies/scaling-policy.js";
import { advanceCycle }        from "./policies/recovery-policy.js";
import { recordCycle, setRunning, DRY_RUN, ALLOW_AUTO_EXEC } from "./state.js";
import type { ControllerCycle, InfraAction } from "./types.js";

let active = false;

// ---------------------------------------------------------------------------
// Scaling proposals (no exec — always human-ratified)
// ---------------------------------------------------------------------------

function buildScalingActions(cpuLoad1m: number, memUsedPct: number): InfraAction[] {
  const now = Date.now();

  if (shouldScaleUp(cpuLoad1m, memUsedPct)) {
    return [{
      id:          randomUUID(),
      type:        "scale_up",
      target:      "rpc-nodes",
      description: `System under load: CPU=${cpuLoad1m.toFixed(2)} mem=${memUsedPct}%. Propose deploying additional RPC node (${SCALING_POLICY.RPC_NODE_IMAGE}).`,
      params: { cpuLoad1m, memUsedPct, image: SCALING_POLICY.RPC_NODE_IMAGE },
      timestamp:   now,
      risk:        "medium",
      autoExecute: false,
    }];
  }

  if (shouldScaleDown(cpuLoad1m, memUsedPct)) {
    return [{
      id:          randomUUID(),
      type:        "scale_down",
      target:      "rpc-nodes",
      description: `System under-utilised: CPU=${cpuLoad1m.toFixed(2)} mem=${memUsedPct}%. Propose decommissioning excess RPC node.`,
      params: { cpuLoad1m, memUsedPct },
      timestamp:   now,
      risk:        "low",
      autoExecute: false,
    }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Single controller cycle
// ---------------------------------------------------------------------------

async function runCycle(): Promise<ControllerCycle> {
  const cycleId   = randomUUID();
  const startTime = Date.now();

  const cycle: ControllerCycle = {
    cycleId,
    startTime,
    actions:  [],
    executed: [],
    errors:   [],
    status:   "running",
  };

  advanceCycle();
  console.log(`[infra-controller] cycle ${cycleId} started`);

  try {
    const state = await analyzeSystem();

    // Run all modules in parallel (each is independent and reads from the pre-snapped state)
    const [hypervisorA, vmA, containerA, nodeA, networkA, dnsA, storageA] = await Promise.all([
      manageHypervisor().catch(err => { cycle.errors.push(`hypervisor: ${String(err)}`); return []; }),
      manageVMs(state).catch(err => { cycle.errors.push(`vm-manager: ${String(err)}`); return []; }),
      manageContainers(state).catch(err => { cycle.errors.push(`docker: ${String(err)}`); return []; }),
      manageNodes(state).catch(err => { cycle.errors.push(`node-manager: ${String(err)}`); return []; }),
      manageNetwork(state).catch(err => { cycle.errors.push(`network: ${String(err)}`); return []; }),
      manageDNS().catch(err => { cycle.errors.push(`dns: ${String(err)}`); return []; }),
      monitorStorage(state).catch(err => { cycle.errors.push(`storage: ${String(err)}`); return []; }),
    ]);

    const scalingA = buildScalingActions(state.cpuLoad1m, state.memUsedPct);

    cycle.actions.push(
      ...hypervisorA, ...vmA, ...containerA, ...nodeA,
      ...networkA, ...dnsA, ...storageA, ...scalingA,
    );

    // Track auto-executed actions for the status report
    cycle.executed = cycle.actions
      .filter(a => a.autoExecute && a.params["executed"] === true)
      .map(a => a.id);

    cycle.status = "completed";

  } catch (err) {
    cycle.errors.push(`cycle-fatal: ${String(err)}`);
    cycle.status = "failed";
  }

  cycle.endTime = Date.now();

  console.log(
    `[infra-controller] cycle ${cycleId} ${cycle.status} — ` +
    `${cycle.actions.length} actions (${cycle.executed.length} auto-executed), ` +
    `${cycle.errors.length} errors, ${cycle.endTime - cycle.startTime}ms`
  );

  if (cycle.actions.length > 0) {
    for (const a of cycle.actions) {
      const exe = a.autoExecute ? (a.params["executed"] ? " [EXECUTED]" : " [EXEC-FAILED]") : "";
      console.log(`  [action] ${a.type}@${a.target} (${a.risk})${exe}: ${a.description.slice(0, 80)}`);
    }
  }

  recordCycle(cycle);
  return cycle;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runInfraController(): Promise<void> {
  active = true;
  setRunning(true);

  console.log(
    `[infra-controller] GhostChain Autonomous Infrastructure Controller started. ` +
    `DRY_RUN=${DRY_RUN}, ALLOW_AUTO_EXEC=${ALLOW_AUTO_EXEC}, cycle=${SCALING_POLICY.CYCLE_INTERVAL_MS / 1000}s`
  );

  while (active) {
    await runCycle();

    if (active) {
      await new Promise<void>(res => setTimeout(res, SCALING_POLICY.CYCLE_INTERVAL_MS));
    }
  }

  setRunning(false);
  console.log("[infra-controller] stopped.");
}

export function stopInfraController(): void {
  active = false;
}
