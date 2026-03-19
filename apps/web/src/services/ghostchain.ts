/**
 * ghostchain.ts — Unified GhostChain L1/L2/L3 RPC service client.
 *
 * All RPC calls are proxied through the BFF (`/api/command-center/*`) so that
 * raw node endpoints are never exposed to the browser and CORS is not an issue.
 *
 * Chain IDs:
 *   L1 → 14000101  (GhostChain sovereign, RPC :18545)
 *   L2 → 901       (GhostL2,             RPC :29547)
 *   L3 → 903       (GhostL3,             RPC :39545)
 */

export type ChainLayer = 'l1' | 'l2' | 'l3';

export interface ChainConfig {
  layer: ChainLayer;
  chainId: number;
  rpcPort: number;
  label: string;
}

export const CHAIN_CONFIGS: Record<ChainLayer, ChainConfig> = {
  l1: { layer: 'l1', chainId: 14000101, rpcPort: 18545, label: 'GhostChain L1' },
  l2: { layer: 'l2', chainId: 901,      rpcPort: 29547, label: 'GhostL2'       },
  l3: { layer: 'l3', chainId: 903,      rpcPort: 39545, label: 'GhostL3'       },
};

export interface BlockInfo {
  number: number;
  hash: string;
  timestamp: number;
  gasUsed: string;
  gasLimit: string;
  txCount: number;
}

export interface ChainStatus {
  layer: ChainLayer;
  chainId: number;
  label: string;
  ok: boolean;
  blockNumber?: number;
  gasPriceGwei?: number;
  peers?: number;
  syncStatus?: { syncing: boolean; currentBlock?: number; highestBlock?: number };
  latencyMs?: number;
  error?: string;
}

export interface ChainStatusAll {
  l1: ChainStatus;
  l2: ChainStatus;
  l3: ChainStatus;
  fetchedAt: string;
}

export interface MempoolSnapshot {
  layer: ChainLayer;
  pending: number;
  queued: number;
  totalTxs: number;
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BFF ${path} → HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Live status for a single chain layer. */
export async function fetchChainStatus(layer: ChainLayer): Promise<ChainStatus> {
  return bff<ChainStatus>(`/api/command-center/chain-health?chain=${layer}`);
}

/** Live status for all three layers in one call. */
export async function fetchAllChainStatus(): Promise<ChainStatusAll> {
  return bff<ChainStatusAll>('/api/command-center/chain-health?chain=all');
}

/** Recent blocks for a given layer. */
export async function fetchRecentBlocks(
  layer: ChainLayer,
  count = 10,
): Promise<BlockInfo[]> {
  return bff<BlockInfo[]>(`/api/command-center/chain-health?chain=${layer}&resource=blocks&count=${count}`);
}

/** Mempool snapshot for a given layer. */
export async function fetchMempoolSnapshot(layer: ChainLayer): Promise<MempoolSnapshot> {
  return bff<MempoolSnapshot>(`/api/command-center/chain-health?chain=${layer}&resource=mempool`);
}
