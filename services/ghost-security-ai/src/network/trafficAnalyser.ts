/**
 * Traffic Analyser
 *
 * Analyses transaction volumes and gas activity from network snapshots
 * to detect mempool flooding, gas-price manipulation, and abnormal
 * throughput patterns.
 *
 * Works on the NetworkSnapshot produced by networkIDS and the latest
 * block data from L1.
 */

import { rpcCall, hexToNumber } from '../rpcHelper.js';
import { recordThreat }         from '../securityBus.js';
import type { NetworkSnapshot, ThreatEvent } from '../types.js';

const L1_RPC               = process.env.L1_RPC_URL                         ?? 'http://localhost:18545';
const GAS_SPIKE_MULT       = Number(process.env.SSA_GAS_SPIKE_MULT           ?? 5);   // 5× median = spike
const TX_VOLUME_SPIKE_MULT = Number(process.env.SSA_TX_VOLUME_SPIKE_MULT     ?? 10);  // 10× median
const HISTORY_SIZE         = 20;

const _gasPriceHistory:  number[] = [];
const _txVolumeHistory:  number[] = [];

let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';
export function getTrafficStatus(): typeof _componentStatus { return _componentStatus; }

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface BlockPayload {
  transactions?: string[] | { hash: string }[];
  gasUsed?:      string;
  gasLimit?:     string;
  baseFeePerGas?: string;
}

export async function analyseTraffic(_snapshot: NetworkSnapshot): Promise<void> {
  try {
    const block = (await rpcCall(L1_RPC, 'ghost_getBlockByNumber', ['latest', false])) as BlockPayload | null;
    if (!block) return;

    const txCount  = Array.isArray(block.transactions) ? block.transactions.length : 0;
    const gasUsed  = block.gasUsed  ? hexToNumber(block.gasUsed)          : 0;
    const gasLimit = block.gasLimit ? hexToNumber(block.gasLimit)         : 1;
    const baseFee  = block.baseFeePerGas ? hexToNumber(block.baseFeePerGas) : 0;
    const gasPct   = gasLimit > 0 ? gasUsed / gasLimit : 0;

    _gasPriceHistory.push(baseFee);
    _txVolumeHistory.push(txCount);
    if (_gasPriceHistory.length > HISTORY_SIZE) _gasPriceHistory.shift();
    if (_txVolumeHistory.length  > HISTORY_SIZE) _txVolumeHistory.shift();

    const medGas = median(_gasPriceHistory);
    const medTx  = median(_txVolumeHistory);

    // Gas spike detection
    if (medGas > 0 && baseFee > medGas * GAS_SPIKE_MULT) {
      _componentStatus = 'warning';
      const evt: ThreatEvent = {
        id:          `ssa-traffic-gas-spike-${Date.now()}`,
        ts:          Date.now(),
        category:    'network',
        level:       'medium',
        title:       'Gas price spike detected on L1',
        description: `Current base fee ${baseFee} is ${(baseFee / medGas).toFixed(1)}× above median ${medGas}. ` +
                     `Possible priority auction or mempool flooding.`,
        source:      L1_RPC,
        metadata:    { baseFee, medianBaseFee: medGas, ratio: baseFee / medGas },
      };
      recordThreat(evt);
    }

    // Transaction volume spike
    if (medTx > 0 && txCount > medTx * TX_VOLUME_SPIKE_MULT) {
      _componentStatus = 'alert';
      const evt: ThreatEvent = {
        id:          `ssa-traffic-tx-spike-${Date.now()}`,
        ts:          Date.now(),
        category:    'network',
        level:       'high',
        title:       'Extreme transaction volume on L1',
        description: `Block contains ${txCount} transactions — ${(txCount / medTx).toFixed(1)}× above median ${medTx}. ` +
                     `Possible DoS / spam attack.`,
        source:      L1_RPC,
        metadata:    { txCount, medianTxCount: medTx, ratio: txCount / medTx },
      };
      recordThreat(evt);
    }

    // Block full (>95% gas utilisation) — not necessarily malicious but bears watching
    if (gasPct > 0.95 && _componentStatus === 'secure') {
      _componentStatus = 'warning';
    } else if (_componentStatus !== 'alert') {
      _componentStatus = 'secure';
    }

    console.log(
      `[SSA:traffic] txCount=${txCount} baseFee=${baseFee} gasFill=${(gasPct * 100).toFixed(1)}%`
    );
  } catch (err) {
    console.error('[SSA:traffic] Analysis failed:', (err as Error).message);
  }
}

export function getTrafficStats(): Record<string, unknown> {
  return {
    status:         _componentStatus,
    medianGasPrice: median(_gasPriceHistory),
    medianTxVolume: median(_txVolumeHistory),
    historyLength:  _txVolumeHistory.length,
  };
}
