/**
 * ghostl3.ts — GhostL3 OP Stack specific service client.
 *
 * GhostL3 (chain_id=903, RPC :39545) is app-specific execution anchored to
 * GhostL2.  L3 never calls L1 directly — all cross-chain traffic goes via L2.
 *
 * All calls go through BFF routes — raw node URLs never reach the browser.
 */

import { fetchChainStatus, type ChainStatus, type BlockInfo } from './ghostchain';

export const L3_CHAIN_ID = 903;
export const L3_LABEL    = 'GhostL3';

// ── L3-specific data shapes ──────────────────────────────────────────────────

export interface L3AppRollupState {
  layer:         'l3';
  chainId:       903;
  label:         string;
  sequencer: {
    running:       boolean;
    safeHead:      number | null;
    unsafeHead:    number | null;
    finalizedHead: number | null;
    l2OriginBlock: number | null;
  };
  l2AnchorBlock: number | null;
  throughputTps: number | null;
  feesCollected: {
    period:      '24h' | '7d';
    amountGst:   string;
  } | null;
  appContracts: Array<{
    name:        string;
    address:     string;
    txCount:     number | null;
  }>;
}

export interface L3BridgeStats {
  depositsL2ToL3: {
    pending:   number | null;
    finalized: number | null;
  };
  withdrawalsL3ToL2: {
    pending:   number | null;
    finalized: number | null;
    challengePeriodHours: number;
  };
}

// ── BFF helper ───────────────────────────────────────────────────────────────

async function bff<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`L3 BFF ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Chain-level status from generic BFF route. */
export const fetchL3ChainStatus = (): Promise<ChainStatus> =>
  fetchChainStatus('l3');

/** Full L3 app-rollup state. */
export async function fetchL3AppRollupState(): Promise<L3AppRollupState> {
  return bff<L3AppRollupState>('/api/chains/l3/rollup');
}

/** Recent L3 blocks. */
export async function fetchL3RecentBlocks(count = 10): Promise<BlockInfo[]> {
  return bff<BlockInfo[]>(`/api/chains/l3/blocks?count=${count}`);
}

/** L3 bridge stats (deposits from L2, withdrawals to L2). */
export async function fetchL3BridgeStats(): Promise<L3BridgeStats> {
  return bff<L3BridgeStats>('/api/chains/l3/bridge-stats');
}

/** L3 fee collector summary (routes to l3-fee-collector on :7681). */
export async function fetchL3FeeCollector(): Promise<{
  totalCollectedGst: string;
  last24hGst:        string;
  pendingDistribution: string;
}> {
  return bff('/api/chains/l3/fees');
}
