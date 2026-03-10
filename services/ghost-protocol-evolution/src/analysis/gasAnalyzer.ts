// gasAnalyzer — fetches real gas utilisation from GhostBrain metrics and
// the L1/L2/L3 RPC layer (ghost_getBlockByNumber → gasUsed / gasLimit).
// Never uses Math.random(); all values come from live chain data.
import type { AnalysisResult } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

interface GhostbrainGasMetrics {
  avgGasUsedPct?: number;
  avgGasPrice?: string;
  l1GasUsedPct?: number;
  l2GasUsedPct?: number;
  l3GasUsedPct?: number;
}

interface RpcBlockGas {
  gasUsed: string;    // hex
  gasLimit: string;   // hex
}

interface RpcResponse {
  result?: RpcBlockGas;
  error?: { message: string };
}

async function fetchGhostbrainGas(): Promise<GhostbrainGasMetrics> {
  const resp = await fetch(`${RULES.ghostbrainUrl}/metrics/gas`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) throw new Error(`ghostbrain /metrics/gas ${resp.status}`);
  return resp.json() as Promise<GhostbrainGasMetrics>;
}

async function rpcGasUsedPct(rpcUrl: string): Promise<number | null> {
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ghost_getBlockByNumber', params: ['latest', false], id: 1 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    const body = await resp.json() as RpcResponse;
    const block = body.result;
    if (!block) return null;
    const used  = parseInt(block.gasUsed,  16);
    const limit = parseInt(block.gasLimit, 16);
    if (!limit) return null;
    return (used / limit) * 100;
  } catch {
    return null;
  }
}

export async function analyzeGas(): Promise<AnalysisResult> {
  const now = new Date().toISOString();

  // Prefer GhostBrain aggregate; fall back to direct RPC
  let gasUsedPct: number | null = null;
  let source = 'ghostbrain';

  try {
    const metrics = await fetchGhostbrainGas();
    gasUsedPct = metrics.avgGasUsedPct ?? metrics.l1GasUsedPct ?? null;
  } catch { /* fall back */ }

  if (gasUsedPct === null) {
    // Try L1 directly
    gasUsedPct = await rpcGasUsedPct(RULES.l1RpcUrl);
    source = 'l1-rpc';
  }
  if (gasUsedPct === null) {
    gasUsedPct = await rpcGasUsedPct(RULES.l2RpcUrl);
    source = 'l2-rpc';
  }

  if (gasUsedPct === null) {
    return { improvementDetected: false, source: 'gas', detail: 'gas metrics unavailable this cycle', ts: now };
  }

  if (gasUsedPct > RULES.targetGasUsagePct) {
    return {
      improvementDetected: true,
      type: 'gas_optimization',
      source: 'gas',
      value: gasUsedPct,
      detail: `Gas utilisation at ${gasUsedPct.toFixed(1)}% (source: ${source}) — exceeds target ${RULES.targetGasUsagePct}%`,
      ts: now,
    };
  }

  return {
    improvementDetected: false,
    source: 'gas',
    detail: `Gas utilisation healthy at ${gasUsedPct.toFixed(1)}% (source: ${source})`,
    ts: now,
  };
}
