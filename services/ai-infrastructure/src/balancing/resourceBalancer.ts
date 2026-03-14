/**
 * resourceBalancer.ts — CPU / memory resource balance manager
 *
 * Runs a balance assessment every 5 minutes.  When CPU or memory is above
 * threshold it emits a rebalance recommendation and optionally triggers an
 * action (e.g. signalling the node scaler to add capacity).
 *
 * Decisions are stored in-memory and exposed via the REST API.
 */

import * as os from "os";
import logger from "../utils/logger";

export type BalanceAction = "rebalance" | "scale-out" | "hold" | "alert";

export interface BalanceSnapshot {
  timestamp: string;
  cpuPercent: number;
  memPercent: number;
  loadAvg: number[];
  action: BalanceAction;
  reason: string;
  recommendations: string[];
}

const CPU_REBALANCE_THRESHOLD = Number(process.env.AIE_BAL_CPU_THRESHOLD ?? 85);
const MEM_REBALANCE_THRESHOLD = Number(process.env.AIE_BAL_MEM_THRESHOLD ?? 88);

const history: BalanceSnapshot[] = [];
const MAX_HISTORY = 200;

// ── Resource calculation ──────────────────────────────────────────────────────

function currentCpuPercent(): number {
  const load  = os.loadavg()[0];
  const cores = os.cpus().length;
  return Math.min(100, Math.round((load / cores) * 100 * 10) / 10);
}

function currentMemPercent(): number {
  const total = os.totalmem();
  const used  = total - os.freemem();
  return Math.round((used / total) * 1000) / 10;
}

// ── Recommendation builder ────────────────────────────────────────────────────

function buildRecommendations(cpuPct: number, memPct: number): string[] {
  const recs: string[] = [];
  if (cpuPct >= CPU_REBALANCE_THRESHOLD) {
    recs.push(`Scale out: CPU at ${cpuPct}% — deploy additional L2 or RPC node`);
    recs.push("Move non-critical AI crons to off-peak schedule");
  }
  if (memPct >= MEM_REBALANCE_THRESHOLD) {
    recs.push(`Memory pressure at ${memPct}% — consider increasing VM RAM or reducing container limits`);
    recs.push("Review container memory limits in docker-compose");
  }
  if (cpuPct < 20 && memPct < 30) {
    recs.push("Resources underutilised — could consolidate containers to save cost");
  }
  return recs;
}

// ── Main balancer ─────────────────────────────────────────────────────────────

export async function balanceResources(): Promise<BalanceSnapshot> {
  const cpuPercent = currentCpuPercent();
  const memPercent = currentMemPercent();
  const loadAvg    = os.loadavg();

  let action: BalanceAction = "hold";
  let reason = "Resources within normal range";

  if (cpuPercent >= CPU_REBALANCE_THRESHOLD || memPercent >= MEM_REBALANCE_THRESHOLD) {
    action = cpuPercent >= CPU_REBALANCE_THRESHOLD ? "scale-out" : "rebalance";
    reason = `CPU: ${cpuPercent}% / MEM: ${memPercent}% — thresholds exceeded`;
    logger.warn(`[ResourceBalancer] Imbalance detected: ${reason}`);
  }

  const snap: BalanceSnapshot = {
    timestamp:      new Date().toISOString(),
    cpuPercent,
    memPercent,
    loadAvg,
    action,
    reason,
    recommendations: buildRecommendations(cpuPercent, memPercent),
  };

  history.unshift(snap);
  if (history.length > MAX_HISTORY) history.pop();

  return snap;
}

export function getBalanceHistory(): BalanceSnapshot[] { return history.slice(0, 60); }
export function getLatestBalance(): BalanceSnapshot | undefined { return history[0]; }
