/**
 * GhostBrain Infrastructure Simulator — Orchestrator
 *
 * Composes the three simulator layers:
 *   buildCurrentState()    — reads live OS/Docker/chain metrics into SimState
 *   simulateAction()       — delta model (action_simulator)
 *   runSimulation()        — wraps simulate + safety evaluation (safety_evaluator)
 *
 * Primary entry point for all callers:
 *
 *   const outcome = await evaluateProposedAction(action);
 *   if (outcome.verdict === "approve") { execute... }
 *
 * History ring (last SIM_HISTORY_SIZE evaluations) is kept in memory for
 * audit visibility via the /api/v1/simulator/history HTTP route.
 *
 * Chain routing law: state is read in L3 → L2 → L1 order for RPC calls.
 */

import os          from "node:os";
import { exec }    from "node:child_process";
import { promisify } from "node:util";

import { runSimulation }       from "./safety_evaluator.js";
import { recordAuditEvent }    from "../audit/chain_audit.js";
import type { SimAction, SimOutcome, SimState, SimContainerState } from "./sim_model.js";
import { resolveRpcEndpoint, rpcBlockNumber } from "../rpc/compat.js";

const execAsync = promisify(exec);

// ── Config ────────────────────────────────────────────────────────────────────

const HISTORY_SIZE      = Number(process.env.SIM_HISTORY_SIZE   ?? "200");
const COLLECT_TIMEOUT   = Number(process.env.SIM_COLLECT_MS     ?? "3000");
const DOCKER_SOCKET     = process.env.DOCKER_SOCKET             ?? "/var/run/docker.sock";
const L1_RPC            = resolveRpcEndpoint(["GHOSTCHAIN_L1_RPC"], ["GHOST_L1_RPC_URLS"], "http://localhost:18545");
const L2_RPC            = resolveRpcEndpoint(["GHOSTCHAIN_L2_RPC"], ["GHOST_L2_RPC_URLS"], "http://localhost:29547");
const L3_RPC            = resolveRpcEndpoint(["GHOSTCHAIN_L3_RPC"], ["GHOST_L3_RPC_URLS"], "http://localhost:39545");

// GhostStack container name patterns → chain layer mapping
const CHAIN_PATTERNS: [RegExp, "l1" | "l2" | "l3"][] = [
  [/ghostchain|ghost-l1|ghostl1/i, "l1"],
  [/ghostl2|ghost-l2/i,           "l2"],
  [/ghostl3|ghost-l3/i,           "l3"],
];

// ── State ─────────────────────────────────────────────────────────────────────

let _stats = {
  totalEvaluations: 0,
  approved:         0,
  blocked:          0,
  ratificationRequired: 0,
  lastStateBuiltAt: 0,
};

const _history: SimOutcome[] = [];

// ── State builder ─────────────────────────────────────────────────────────────

/** Detect which chain layer (if any) a container name belongs to. */
function inferChainLayer(name: string): "l1" | "l2" | "l3" | undefined {
  for (const [pattern, layer] of CHAIN_PATTERNS) {
    if (pattern.test(name)) return layer;
  }
  return undefined;
}

interface DockerJsonLine {
  name?:       string;
  cpu?:        string;  // "1.23%"
  memUsage?:   string;  // "123MiB / 16GiB"
  memPct?:     string;  // "0.75%"
}

function parsePct(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace("%", "")) || 0;
}

function parseMib(s: string | undefined): number {
  if (!s) return 0;
  const m = s.replace(/GiB|MiB|kB|B/g, "").trim().split("/")[0]!.trim();
  const v = parseFloat(m);
  if (s.includes("GiB")) return v * 1024;
  if (s.includes("kB"))  return v / 1024;
  return v; // MiB
}

async function getDockerContainers(): Promise<Record<string, SimContainerState>> {
  try {
    const { stdout } = await execAsync(
      `docker stats --no-stream --format ` +
      `'{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memUsage":"{{.MemUsage}}","memPct":"{{.MemPerc}}"}'` +
      ` 2>/dev/null`,
      { timeout: COLLECT_TIMEOUT },
    );

    const result: Record<string, SimContainerState> = {};
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      try {
        const d = JSON.parse(line) as DockerJsonLine;
        if (!d.name) continue;
        const name       = d.name.replace(/^\//, "");
        const cpuPct     = parsePct(d.cpu);
        const memParts   = (d.memUsage ?? "").split("/");
        const memUsageMb = parseMib(memParts[0]);
        const memLimitMb = parseMib(memParts[1]);
        const memPct     = parsePct(d.memPct);
        const layer      = inferChainLayer(name);

        result[name] = {
          cpuPct,
          memPct,
          memUsageMb,
          memLimitMb: memLimitMb || 0,
          cpuLimitPct: 0,  // docker stats does not expose limit — 0 = unknown
          alive:      true,
          isChainNode: !!layer,
          chainLayer: layer,
        };
      } catch { /* skip malformed line */ }
    }
    return result;
  } catch {
    return {};
  }
}

async function probeChain(rpc: string): Promise<{ alive: boolean; blockHeight: number }> {
  try {
    const probe = await rpcBlockNumber(rpc, 2_000);
    return { alive: true, blockHeight: probe.blockNumber };
  } catch {
    return { alive: false, blockHeight: 0 };
  }
}

/**
 * Build a SimState snapshot from live metrics.
 * Chain probes follow L3 → L2 → L1 routing law.
 */
export async function buildCurrentState(): Promise<SimState> {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();

  // Probe chains in L3 → L2 → L1 order (routing law)
  const [l3, l2, l1, containers] = await Promise.all([
    probeChain(L3_RPC),
    probeChain(L2_RPC),
    probeChain(L1_RPC),
    getDockerContainers(),
  ]);

  _stats.lastStateBuiltAt = Date.now();

  return {
    timestamp: Date.now(),
    host: {
      cpuPct:       Math.min(100, (os.loadavg()[0]! / os.cpus().length) * 100),
      memPct:       100 * (1 - freeMem / totalMem),
      memTotalMb:   totalMem / 1024 / 1024,
      diskIoSatPct: 0,  // populated from node_exporter integration when available
    },
    containers,
    chains: { l1, l2, l3 },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full simulation pipeline for a proposed action.
 *
 * Builds current state, runs the delta model, evaluates safety, returns verdict.
 * Result is recorded in the history ring.
 */
export async function evaluateProposedAction(action: SimAction): Promise<SimOutcome> {
  const preState = await buildCurrentState();
  const outcome  = runSimulation(preState, action);

  // Record stats
  _stats.totalEvaluations++;
  if (outcome.verdict === "approve")               _stats.approved++;
  else if (outcome.verdict === "block")            _stats.blocked++;
  else if (outcome.verdict === "require_ratification") _stats.ratificationRequired++;

  // History ring
  _history.push(outcome);
  if (_history.length > HISTORY_SIZE) _history.shift();

  // Audit trail — non-blocking
  recordAuditEvent(outcome);

  return outcome;
}

/**
 * Simulate against an explicitly supplied preState (for testing / dry-run calls).
 * Does NOT fetch live metrics. Benchmark runs use this path; audit is intentionally
 * suppressed for benchmark corpus runs to avoid polluting the live audit log.
 */
export function evaluateWithState(preState: SimState, action: SimAction, audit = false): SimOutcome {
  const outcome = runSimulation(preState, action);
  _stats.totalEvaluations++;
  if (outcome.verdict === "approve")               _stats.approved++;
  else if (outcome.verdict === "block")            _stats.blocked++;
  else if (outcome.verdict === "require_ratification") _stats.ratificationRequired++;
  _history.push(outcome);
  if (_history.length > HISTORY_SIZE) _history.shift();
  if (audit) recordAuditEvent(outcome);
  return outcome;
}

/** Return the last N simulation outcomes (most recent last). */
export function getSimHistory(limit = 50): SimOutcome[] {
  return _history.slice(-Math.min(limit, HISTORY_SIZE));
}

export function simulatorStats() {
  return { ..._stats };
}
