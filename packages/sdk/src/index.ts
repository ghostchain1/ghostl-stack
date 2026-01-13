export type ChainRef = { id: string; name: string; rpcUrl: string; kind: 'L1' | 'L2' | 'L3' };
export type WalletRef = { id: string; label: string; address: string; chainId: string; kind: 'watch' | 'external' | 'custodial' };
export type HealthStatus = { ok: boolean; latencyMs?: number; head?: number; peers?: number };

// Basic registry helpers for chain metadata and RPC endpoints.
export function defineChain(ref: ChainRef) {
  return ref;
}

// Watch-only wallet creation helper.
export function createWatchWallet(label: string, address: string, chainId: string): WalletRef {
  return { id: `w-${Math.random().toString(16).slice(2, 8)}`, label, address, chainId, kind: 'watch' };
}

// Mock RPC health check placeholder (replace with real RPC client).
export async function checkRpcHealth(rpcUrl: string): Promise<HealthStatus> {
  // TODO: wire to JSON-RPC or provider; return optimistic placeholder for now.
  return { ok: true, latencyMs: 42, head: 0, peers: 0 };
}

export function linkWalletToUser(wallet: WalletRef, userId: string) {
  return { ...wallet, owner: userId };
}
