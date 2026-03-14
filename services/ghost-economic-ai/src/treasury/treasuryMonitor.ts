/**
 * Treasury Monitor
 *
 * Polls the GhostChain L1 RPC for the treasury wallet balance using
 * ghost_getBalance (GhostChain EVM namespace — never eth_getBalance).
 *
 * Maintains a small history ring for flow-rate calculations.
 */

import { rpcCall, hexToBigInt, hexToNumber } from '../rpc.js';
import { type TreasuryState, weiToGst }      from '../types.js';

const L1_RPC_URL     = process.env.L1_RPC_URL      ?? 'http://localhost:18545';
const TREASURY_WALLET = process.env.AEE_TREASURY_WALLET ?? '';

// Ring buffer: last 10 treasury snapshots (used by market analyzer for flow rate)
const HISTORY_CAP = 10;
const _history: TreasuryState[] = [];

export function getTreasuryHistory(): readonly TreasuryState[] {
  return _history;
}

export async function monitorTreasury(): Promise<TreasuryState | null> {
  if (!TREASURY_WALLET) {
    console.warn('[AEE:treasury] AEE_TREASURY_WALLET not set — skipping treasury monitor');
    return null;
  }

  try {
    const [balHex, blockHex] = await Promise.all([
      rpcCall(L1_RPC_URL, 'ghost_getBalance',   [TREASURY_WALLET, 'latest']),
      rpcCall(L1_RPC_URL, 'ghost_blockNumber',  []),
    ]);

    const balanceWei   = hexToBigInt(balHex);
    const blockNumber  = hexToNumber(blockHex);
    const balanceGst   = weiToGst(balanceWei);

    const state: TreasuryState = {
      walletAddress: TREASURY_WALLET,
      balanceWei,
      balanceGst,
      blockNumber,
      ts: Date.now(),
    };

    _history.push(state);
    if (_history.length > HISTORY_CAP) _history.shift();

    console.log(`[AEE:treasury] balance=${balanceGst.toFixed(2)} GST  block=${blockNumber}`);
    return state;
  } catch (err) {
    console.error('[AEE:treasury] monitor failed:', (err as Error).message);
    return null;
  }
}
