/**
 * Market Analyzer
 *
 * Builds MarketMetrics from on-chain data polled via ghost_ RPC.
 *
 * Tracks:
 *   - TPS (transactions per second, rolling over last N blocks)
 *   - Block time (ms between consecutive blocks)
 *   - Treasury flow rate (GST/minute based on balance history)
 *   - Burn rate (estimated from proposal history)
 *
 * Data sources: GhostChain L1 RPC exclusively — no external APIs.
 */

import { rpcCall, hexToNumber }           from '../rpc.js';
import { type BlockSample, type MarketMetrics, type TreasuryState } from '../types.js';

const L1_RPC_URL  = process.env.L1_RPC_URL ?? 'http://localhost:18545';
const WINDOW_SIZE = 20; // blocks to analyze for TPS

const _blockSamples: BlockSample[] = [];
let _lastMetrics: MarketMetrics | null = null;

interface RpcBlock {
  number:       string;
  timestamp:    string;
  transactions: unknown[];
}

async function fetchLatestBlock(): Promise<RpcBlock | null> {
  try {
    const block = await rpcCall(L1_RPC_URL, 'ghost_getBlockByNumber', ['latest', false]);
    return block as RpcBlock;
  } catch {
    return null;
  }
}

function computeTps(samples: BlockSample[]): { avg: number; peak: number; blockTimeAvgMs: number } {
  if (samples.length < 2) return { avg: 0, peak: 0, blockTimeAvgMs: 0 };

  let totalTx = 0;
  let peakTps = 0;
  let totalTimeMs = 0;

  for (let i = 1; i < samples.length; i++) {
    const dt    = samples[i]!.ts - samples[i - 1]!.ts;
    const txs   = samples[i]!.txCount;
    const tps   = dt > 0 ? (txs / (dt / 1000)) : 0;
    if (tps > peakTps) peakTps = tps;
    totalTx    += txs;
    totalTimeMs += dt;
  }

  const elapsedSec = totalTimeMs / 1000;
  const avgTps     = elapsedSec > 0 ? totalTx / elapsedSec : 0;
  const avgBlockMs  = totalTimeMs / (samples.length - 1);

  return { avg: avgTps, peak: peakTps, blockTimeAvgMs: avgBlockMs };
}

function computeFlowRate(history: readonly TreasuryState[]): number {
  if (history.length < 2) return 0;
  const oldest = history[0]!;
  const newest = history[history.length - 1]!;
  const dtMin  = (newest.ts - oldest.ts) / 60_000;
  if (dtMin < 0.001) return 0;
  return (newest.balanceGst - oldest.balanceGst) / dtMin;
}

export function getMarketMetrics(): MarketMetrics | null {
  return _lastMetrics;
}

export async function analyzeMarket(
  treasuryHistory: readonly TreasuryState[]
): Promise<MarketMetrics> {
  const block = await fetchLatestBlock();
  const now   = Date.now();

  if (block) {
    const blockTs = Number(BigInt(block.timestamp) * 1000n); // solidity timestamp → ms
    const txCount = block.transactions.length;
    const blockNum = hexToNumber(block.number);

    // Dedup: don't append the same block twice
    if (_blockSamples.length === 0 || _blockSamples[_blockSamples.length - 1]!.blockNumber !== blockNum) {
      _blockSamples.push({ blockNumber: blockNum, txCount, ts: blockTs || now });
      if (_blockSamples.length > WINDOW_SIZE + 1) _blockSamples.shift();
    }
  }

  const { avg: tpsAvg, peak: tpsPeak, blockTimeAvgMs } = computeTps(_blockSamples);
  const treasuryFlowGstPerMin = computeFlowRate(treasuryHistory);

  _lastMetrics = { tpsAvg, tpsPeak, blockTimeAvgMs, treasuryFlowGstPerMin, burnRatePct: 0, ts: now };
  return _lastMetrics;
}
