/**
 * GhostBrain Core — Hypervisor Controller
 *
 * Top-level infrastructure observer. Polls:
 *  1. VM layer (via vm_controller)
 *  2. Container layer (via docker_controller)
 *  3. GhostChain layer health (L1/L2/L3 RPC liveness checks)
 *
 * Drives the periodic observe → learn → decide cycle.
 * Emits Prometheus metrics for observability.
 */

import { collectVmSnapshots }      from "./vm_controller.js";
import { collectDockerSnapshots }  from "./docker_controller.js";
import { learn }                   from "../cognition/learning_engine.js";
import { decide }                  from "../cognition/decision_engine.js";
import { getInfraHistory }         from "../memory/infrastructure_memory.js";
import { request }                 from "undici";

const L1_RPC = process.env.GHOSTCHAIN_L1_RPC ?? "http://localhost:18545";
const L2_RPC = process.env.GHOSTCHAIN_L2_RPC ?? "http://localhost:29545";
const L3_RPC = process.env.GHOSTCHAIN_L3_RPC ?? "http://localhost:39545";

const COLLECT_INTERVAL_MS = Number(process.env.GHOSTBRAIN_COLLECT_INTERVAL_MS ?? 30_000);

// Prometheus-style counters (written to a shared metrics object that status.ts exposes)
export const metrics = {
  memoryEntries:     0,
  infraLoadScore:    0,
  aiActionsTotal:    0,
  crashPrevention:   0,
  collectCycles:     0,
};

let _intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Check if a GhostChain RPC endpoint is alive. */
async function checkChainHealth(rpc: string, chain: string): Promise<boolean> {
  try {
    const res = await request(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ghost_blockNumber", params: [], id: 1 }),
      bodyTimeout: 4_000,
    });
    return res.statusCode === 200;
  } catch {
    // Chain might use eth_ namespace fallback
    try {
      const res2 = await request(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
        bodyTimeout: 4_000,

      });
      if (res2.statusCode !== 200) return false;
      // Feed into learning
      void learn({ type: "infra_snap", resourceId: chain, layer: "chain", cpuPct: 0, memPct: 0, healthy: true });
      return true;
    } catch {
      void learn({ type: "infra_snap", resourceId: chain, layer: "chain", cpuPct: 0, memPct: 100, healthy: false, meta: { rpc } });
      return false;
    }
  }
}

/** One full observe cycle: collect → learn → decide on critical resources. */
export async function runObserveCycle(): Promise<{
  docker: { processed: number; errors: number };
  vm:     { processed: number; source: string };
  chains: Record<string, boolean>;
  decisions: ReturnType<typeof decide>[];
}> {
  metrics.collectCycles++;

  // 1. Collect infrastructure state
  const [docker, vm] = await Promise.all([
    collectDockerSnapshots(),
    collectVmSnapshots(),
  ]);

  // 2. GhostChain liveness
  const [l1, l2, l3] = await Promise.all([
    checkChainHealth(L1_RPC, "ghostchain-l1"),
    checkChainHealth(L2_RPC, "ghostchain-l2"),
    checkChainHealth(L3_RPC, "ghostchain-l3"),
  ]);

  // 3. Make decisions on recently critical resources
  const criticalResources = getInfraHistory(undefined, undefined, COLLECT_INTERVAL_MS * 2)
    .filter(s => s.severity === "critical")
    .map(s => s.resourceId);
  const uniqueCritical = [...new Set(criticalResources)];

  const decisions = uniqueCritical.map(id => decide(id));

  // 4. Update metrics
  metrics.infraLoadScore = criticalResources.length;
  metrics.aiActionsTotal += decisions.filter(d => d.action !== "none").length;
  metrics.crashPrevention += decisions.filter(d => d.predictedFailure).length;

  return { docker, vm, chains: { l1, l2, l3 }, decisions };
}

/** Start the autonomous observe cycle on a fixed interval. */
export function startHypervisorLoop(): void {
  if (_intervalHandle) return;
  _intervalHandle = setInterval(() => {
    runObserveCycle().catch(() => { /* swallow — never crash the main process */ });
  }, COLLECT_INTERVAL_MS);
  // Run first cycle immediately
  runObserveCycle().catch(() => {});
}

/** Stop the observe cycle (SIGTERM). */
export function stopHypervisorLoop(): void {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}
