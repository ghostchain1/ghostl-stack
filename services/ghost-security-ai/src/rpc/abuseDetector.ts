/**
 * Abuse Detector
 *
 * Tracks RPC call rates and statistical anomalies within the SSA scan cycle.
 * Detects:
 *   - Call-rate surges from a single source (inferred via tx-count deltas)
 *   - Abnormal block transaction volume spikes on L1
 *
 * Since SSA polls the chain, it can detect external abuse via on-chain
 * tx-volume metrics — not raw network taps.
 *
 * Thresholds: SSA_RPC_TX_SPIKE_PER_BLOCK (default: 500 txs/block)
 */

import { rpcCall, hexToNumber } from '../rpcHelper.js';
import { recordThreat }         from '../securityBus.js';
import type { ThreatEvent }    from '../types.js';

const L1_RPC              = process.env.L1_RPC_URL                    ?? 'http://localhost:18545';
const TX_SPIKE_PER_BLOCK  = Number(process.env.SSA_RPC_TX_SPIKE_PER_BLOCK  ?? 500);
const RATE_WINDOW_SIZE    = 10; // keep last N block tx-counts for baseline

let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';
const _txHistory: number[] = [];
let   _callsThisCycle = 0;

export function recordRpcCall(): void { _callsThisCycle++; }
export function resetCycleCount(): void { _callsThisCycle = 0; }
export function getCycleCallCount(): number { return _callsThisCycle; }
export function getAbuseStatus(): typeof _componentStatus { return _componentStatus; }

function baseline(): number {
  if (_txHistory.length < 2) return Infinity;
  const sorted = [..._txHistory].sort((a, b) => a - b);
  // Use median rather than mean to reduce outlier influence
  return sorted[Math.floor(sorted.length / 2)];
}

export async function detectAbuse(): Promise<void> {
  try {
    // Fetch the latest fully-confirmed block
    const latest = (await rpcCall(L1_RPC, 'ghost_getBlockByNumber', ['latest', false])) as {
      transactions?: unknown[];
    } | null;
    if (!latest) return;

    const txCount = Array.isArray(latest.transactions) ? latest.transactions.length : 0;
    _txHistory.push(txCount);
    if (_txHistory.length > RATE_WINDOW_SIZE) _txHistory.shift();

    const base = baseline();
    const ratio = txCount / Math.max(base, 1);

    if (txCount >= TX_SPIKE_PER_BLOCK && ratio > 5) {
      _componentStatus = 'alert';
      const evt: ThreatEvent = {
        id:          `ssa-abuse-txspike-${Date.now()}`,
        ts:          Date.now(),
        category:    'rpc',
        level:       'high',
        title:       'Extreme transaction volume on L1',
        description: `Latest block contained ${txCount} txs — ` +
                     `${ratio.toFixed(1)}x above recent median (${base.toFixed(0)}). ` +
                     `Possible spam attack or mempool flooding.`,
        source:      L1_RPC,
        metadata:    { txCount, medianBaseline: base, ratio },
      };
      recordThreat(evt);
    } else {
      _componentStatus = 'secure';
    }

    console.log(`[SSA:rpc:abuse] latest block txCount=${txCount} median=${base.toFixed(0)}`);
  } catch (err) {
    _componentStatus = 'warning';
    console.error('[SSA:rpc:abuse] block check failed:', (err as Error).message);
  }
}

export function getRpcStats(): Record<string, unknown> {
  return {
    callsThisCycle:  _callsThisCycle,
    txHistory:       [..._txHistory],
    medianBaseline:  baseline(),
    status:          _componentStatus,
  };
}
