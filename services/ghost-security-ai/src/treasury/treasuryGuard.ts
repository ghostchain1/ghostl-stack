/**
 * Treasury Guard
 *
 * Watches the canonical GhostChain treasury wallet (SSA_TREASURY_WALLET) for:
 *   - Sudden GST balance drops (drain attack or governance-bypass withdrawal)
 *   - Balance below minimum floor (SSA_TREASURY_MIN_GST)
 *
 * Uses ghost_getBalance via native http. No axios. No ethers.
 */

import { rpcCall, hexToBigInt, sanitizeAddress } from '../rpcHelper.js';
import { recordThreat, notifyGhostBrain }        from '../securityBus.js';
import type { ThreatEvent }                      from '../types.js';

const L1_RPC          = process.env.L1_RPC_URL             ?? 'http://localhost:18545';
const RAW_WALLET      = process.env.SSA_TREASURY_WALLET    ?? '';
const DRAIN_PCT       = Number(process.env.SSA_TREASURY_DRAIN_PCT      ?? 0.10); // 10% drop
const MIN_GST         = Number(process.env.SSA_TREASURY_MIN_GST        ?? 1_000_000);
const GST_UNIT        = BigInt('1000000000000000000');

const TREASURY_WALLET = RAW_WALLET ? sanitizeAddress(RAW_WALLET) : null;

let _prevBalanceGst: number | null = null;
let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';

export function getTreasuryStatus(): typeof _componentStatus { return _componentStatus; }
export function getTreasuryBalance(): number | null          { return _prevBalanceGst; }

export async function guardTreasury(): Promise<void> {
  if (!TREASURY_WALLET) {
    console.warn('[SSA:treasury] SSA_TREASURY_WALLET not configured — skipping treasury guard');
    _componentStatus = 'warning';
    return;
  }

  try {
    const hex        = await rpcCall(L1_RPC, 'ghost_getBalance', [TREASURY_WALLET, 'latest']);
    const balanceGst = Number(hexToBigInt(hex) / GST_UNIT);
    const prev       = _prevBalanceGst;

    if (prev !== null) {
      const drop    = prev - balanceGst;
      const dropPct = drop / Math.max(prev, 1);

      // Percentage drain
      if (drop > 0 && dropPct > DRAIN_PCT) {
        _componentStatus = 'alert';
        const evt: ThreatEvent = {
          id:          `ssa-treasury-drain-${Date.now()}`,
          ts:          Date.now(),
          category:    'treasury',
          level:       dropPct > 0.5 ? 'critical' : 'high',
          title:       `Treasury drained ${(dropPct * 100).toFixed(1)}%`,
          description: `Treasury wallet ${TREASURY_WALLET} lost ${drop.toFixed(0)} GST ` +
                       `(${(dropPct * 100).toFixed(1)}%) in one scan window. ` +
                       `Previous: ${prev.toFixed(0)} GST → Current: ${balanceGst.toFixed(0)} GST`,
          source:      TREASURY_WALLET,
          metadata:    { prevGst: prev, currentGst: balanceGst, dropPct },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
      }

      // Below minimum floor
      if (balanceGst < MIN_GST) {
        _componentStatus = 'warning';
        const evt: ThreatEvent = {
          id:          `ssa-treasury-low-${Date.now()}`,
          ts:          Date.now(),
          category:    'treasury',
          level:       'medium',
          title:       `Treasury below minimum floor`,
          description: `Treasury has ${balanceGst.toFixed(0)} GST, below minimum of ${MIN_GST} GST. ` +
                       `Reward distribution and protocol operations may be disrupted.`,
          source:      TREASURY_WALLET,
          metadata:    { balanceGst, minGst: MIN_GST },
        };
        recordThreat(evt);
      }

      if (drop <= 0 && balanceGst >= MIN_GST) {
        _componentStatus = 'secure';
      }
    }

    _prevBalanceGst = balanceGst;
    console.log(`[SSA:treasury] balance=${balanceGst.toFixed(2)} GST — ${_componentStatus}`);
  } catch (err) {
    _componentStatus = 'warning';
    console.error('[SSA:treasury] Poll failed:', (err as Error).message);
  }
}
