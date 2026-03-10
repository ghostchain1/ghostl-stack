// performanceAnalyzer — fetches real block-time and throughput metrics from
// GhostBrain and the L1/L2/L3 RPC endpoints.
// Never uses Math.random(); all values come from live data.
import type { AnalysisResult } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

interface GhostbrainPerfMetrics {
  avgBlockTimeMs?: number;
  tps?: number;
  pendingTxCount?: number;
  chainStatus?: string;
}

interface RpcBlock {
  timestamp: string;    // hex
  transactions: unknown[];
}

interface RpcResponse {
  result?: RpcBlock;
  error?: { message: string };
}

async function fetchGhostbrainPerf(): Promise<GhostbrainPerfMetrics> {
  const resp = await fetch(`${RULES.ghostbrainUrl}/metrics/performance`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) throw new Error(`ghostbrain /metrics/performance ${resp.status}`);
  return resp.json() as Promise<GhostbrainPerfMetrics>;
}

/** Derive block time by comparing the two most recent L1 blocks via ghost_getBlockByNumber. */
async function fetchL1BlockTimeMs(): Promise<number | null> {
  const call = (tag: string) =>
    fetch(RULES.l1RpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ghost_getBlockByNumber', params: [tag, false], id: 1 }),
      signal: AbortSignal.timeout(8_000),
    });

  const [latestResp, parentResp] = await Promise.all([call('latest'), call('pending')]);
  if (!latestResp.ok || !parentResp.ok) return null;

  const [latest, parent] = await Promise.all([
    latestResp.json() as Promise<RpcResponse>,
    parentResp.json() as Promise<RpcResponse>,
  ]);

  const latestTs = latest.result ? parseInt(latest.result.timestamp, 16) * 1_000 : null;
  const parentTs = parent.result ? parseInt(parent.result.timestamp, 16) * 1_000 : null;

  if (latestTs === null || parentTs === null || latestTs === parentTs) return null;
  return Math.abs(latestTs - parentTs);
}

export async function analyzePerformance(): Promise<AnalysisResult> {
  const now = new Date().toISOString();

  let metrics: GhostbrainPerfMetrics = {};
  try {
    metrics = await fetchGhostbrainPerf();
  } catch {
    // Fall back to L1 RPC if GhostBrain metrics unavailable
  }

  let blockTimeMs = metrics.avgBlockTimeMs ?? null;
  if (blockTimeMs === null) {
    try {
      blockTimeMs = await fetchL1BlockTimeMs();
    } catch { /* leave null — skip analysis this cycle */ }
  }

  if (blockTimeMs === null) {
    return { improvementDetected: false, source: 'performance', detail: 'performance metrics unavailable this cycle', ts: now };
  }

  if (blockTimeMs > RULES.maxBlockTimeMs) {
    return {
      improvementDetected: true,
      type: 'block_time_reduction',
      source: 'performance',
      value: blockTimeMs,
      detail: `Average block time ${blockTimeMs.toFixed(0)}ms exceeds target ${RULES.maxBlockTimeMs}ms — possible congestion`,
      ts: now,
    };
  }

  // Throughput check (if GhostBrain reports TPS)
  if (metrics.tps !== undefined && metrics.pendingTxCount !== undefined && metrics.pendingTxCount > 500) {
    return {
      improvementDetected: true,
      type: 'throughput_increase',
      source: 'performance',
      value: metrics.pendingTxCount,
      detail: `${metrics.pendingTxCount} pending transactions — throughput increase may be warranted`,
      ts: now,
    };
  }

  return {
    improvementDetected: false,
    source: 'performance',
    detail: `Performance healthy — block time ${blockTimeMs.toFixed(0)}ms`,
    ts: now,
  };
}
