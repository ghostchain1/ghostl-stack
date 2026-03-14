/**
 * ghostchain-api.ts — Client-side helpers for GhostChain L1/L2/L3 RPC calls.
 *
 * All calls are routed through the BFF (`/api/command-center/*`) to avoid
 * CORS issues and to keep RPC URLs server-side only.
 */

export type ChainId = 'l1' | 'l2' | 'l3';

export interface ChainHealth {
  status: 'ok' | 'degraded';
  chainId?: number;
  blockNumber?: number;
}

export interface NodeList {
  nodes: Array<{
    name: string;
    layer: string;
    chainId: number;
    rpc: string;
    status: string;
    blockNumber?: number;
  }>;
}

export async function fetchChainHealth(chain: ChainId): Promise<ChainHealth> {
  const res = await fetch(`/api/command-center/chain-health?chain=${chain}`, {
    cache: 'no-store',
  });
  if (!res.ok) return { status: 'degraded' };
  return res.json() as Promise<ChainHealth>;
}

export async function fetchAllNodes(): Promise<NodeList> {
  const res = await fetch('/api/command-center/nodes', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<NodeList>;
}
