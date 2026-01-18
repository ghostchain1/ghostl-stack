import type { RpcEndpoint } from '@ghostl/types/integrations';

export type ChainRef = { id: string; name: string; rpcUrl: string; kind: 'L1' | 'L2' | 'L3' };
export type WalletRef = { id: string; label: string; address: string; chainId: string; kind: 'watch' | 'external' | 'custodial' };
export type HealthStatus = {
  ok: boolean;
  latencyMs?: number;
  head?: number;
  peers?: number;
  syncing?: boolean;
  clientVersion?: string;
};

// Basic registry helpers for chain metadata and RPC endpoints.
export function defineChain(ref: ChainRef) {
  return ref;
}

// Watch-only wallet creation helper.
export function createWatchWallet(label: string, address: string, chainId: string): WalletRef {
  return { id: `w-${Math.random().toString(16).slice(2, 8)}`, label, address, chainId, kind: 'watch' };
}

const rpcCall = async <T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> => {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`rpc_${method}_failed`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result as T;
};

// RPC health check using JSON-RPC.
export async function checkRpcHealth(rpcUrl: string): Promise<HealthStatus> {
  const started = Date.now();
  try {
    const blockHex = await rpcCall<string>(rpcUrl, 'eth_blockNumber');
    const peerHex = await rpcCall<string>(rpcUrl, 'net_peerCount');
    const syncing = await rpcCall<boolean | { startingBlock?: string }>(rpcUrl, 'eth_syncing').then((r) => r !== false);
    const clientVersion = await rpcCall<string>(rpcUrl, 'web3_clientVersion');
    const head = parseInt(blockHex, 16);
    const peers = parseInt(peerHex, 16);
    return {
      ok: true,
      latencyMs: Date.now() - started,
      head: Number.isNaN(head) ? undefined : head,
      peers: Number.isNaN(peers) ? undefined : peers,
      syncing,
      clientVersion
    };
  } catch {
    return { ok: false };
  }
}

export function linkWalletToUser(wallet: WalletRef, userId: string) {
  return { ...wallet, owner: userId };
}

export type RpcDiscoveryOptions = {
  apiBase?: string;
  registryUrl?: string;
};

// Fetch RPC endpoints from GhostL API (preferred) or registry directly.
export async function fetchRpcEndpoints(options: RpcDiscoveryOptions = {}): Promise<RpcEndpoint[]> {
  const apiBase = options.apiBase || 'http://localhost:4000';
  const registryUrl = options.registryUrl || 'https://rpc.ghostchain.cloud/v1/endpoints';
  try {
    const res = await fetch(`${apiBase}/integrations/rpc`);
    if (res.ok) return (await res.json()) as RpcEndpoint[];
  } catch {
    // fall through
  }
  const res = await fetch(registryUrl);
  if (!res.ok) return [];
  const body = await res.json();
  if (Array.isArray(body)) return body as RpcEndpoint[];
  if (body && Array.isArray(body.endpoints)) return body.endpoints as RpcEndpoint[];
  if (body && Array.isArray(body.chains)) {
    const endpoints: RpcEndpoint[] = [];
    body.chains.forEach((chain: { chainId: number; chainName?: string; layer?: string; endpoints?: { url: string }[] }) => {
      (chain.endpoints || []).forEach((endpoint) => {
        endpoints.push({
          id: `${chain.chainId}-${endpoint.url}`,
          chainId: String(chain.chainId),
          chainName: chain.chainName,
          layer: chain.layer,
          url: endpoint.url,
          type: 'public',
          status: 'healthy'
        });
      });
    });
    return endpoints;
  }
  return [];
}

export function selectRpcForChain(endpoints: RpcEndpoint[], chainId: string, protocol: 'http' | 'ws' = 'http') {
  return endpoints
    .filter((endpoint) => endpoint.chainId === chainId && (endpoint.protocol || 'http') === protocol)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))[0];
}
