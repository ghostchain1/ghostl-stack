/**
 * ghostl2.ts — GhostL2 service client.
 *
 * GhostL2 (chain_id=901, RPC :29547) anchors to GhostChain L1. This module provides
 * L2-specific queries beyond the
 * generic chain-status that ghostchain.ts exposes.
 *
 * All calls go through BFF routes — raw node URLs never reach the browser.
 */

import { fetchChainStatus, type ChainStatus, type BlockInfo } from './ghostchain';

export const L2_CHAIN_ID = 901;
export const L2_LABEL    = 'GhostL2';

// ── L2-specific data shapes ──────────────────────────────────────────────────

export interface L2SequencerStatus {
  running:        boolean;
  safeHead:       number | null;
  unsafeHead:     number | null;
  finalizedHead:  number | null;
  l1OriginBlock:  number | null;
  batcherConnected: boolean;
}

export interface L2BatcherStatus {
  running:        boolean;
  lastBatchBlock: number | null;
  pendingTxs:     number;
  latencyMs:      number | null;
}

export interface L2RollupState {
  layer:          'l2';
  chainId:        901;
  label:          string;
  sequencer:      L2SequencerStatus;
  batcher:        L2BatcherStatus;
  l1AnchorBlock:  number | null;
  depositTxCount: number | null;
  withdrawals: {
    pending:     number | null;
    finalized:   number | null;
  };
  gasOracle: {
    l1BaseFee:   string | null;
    l2BaseFee:   string | null;
    overhead:    number | null;
    scalar:      number | null;
  };
}

// ── BFF helper ───────────────────────────────────────────────────────────────

async function bff<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`L2 BFF ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Chain-level status (block number, gas, peers) from generic BFF route. */
export const fetchL2ChainStatus = (): Promise<ChainStatus> =>
  fetchChainStatus('l2');

/** Full L2 rollup state including sequencer/batcher/withdrawal info. */
export async function fetchL2RollupState(): Promise<L2RollupState> {
  return bff<L2RollupState>('/api/chains/l2/rollup');
}

/** Recent L2 blocks. */
export async function fetchL2RecentBlocks(count = 10): Promise<BlockInfo[]> {
  return bff<BlockInfo[]>(`/api/chains/l2/blocks?count=${count}`);
}

/** L2 mempool snapshot. */
export async function fetchL2Mempool(): Promise<{ pending: number; queued: number }> {
  return bff<{ pending: number; queued: number }>('/api/chains/l2/mempool');
}

/** L2 deposits from L1 bridge. */
export async function fetchL2Deposits(limit = 20): Promise<Array<{
  txHash:    string;
  from:      string;
  to:        string;
  valueGst:  string;
  l1Block:   number;
  l2Block:   number | null;
  status:    'pending' | 'included' | 'finalized';
}>> {
  return bff(`/api/chains/l2/deposits?limit=${limit}`);
}
