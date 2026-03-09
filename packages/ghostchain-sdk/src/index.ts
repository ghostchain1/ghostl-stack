export type RpcClient = {
  url: string;
  call: <T>(method: string, params?: unknown[]) => Promise<T>;
  getBlockNumber: () => Promise<bigint>;
  getChainId: () => Promise<bigint>;
  getGasPrice: () => Promise<bigint>;
  getBalance: (address: string) => Promise<bigint>;
  sendRawTransaction: (tx: string) => Promise<string>;
};

const rpcCall = async <T>(url: string, method: string, params: unknown[] = []): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result as T;
};

const parseHex = (hex: string) => BigInt(hex);

export const createRpcClient = (url: string): RpcClient => ({
  url,
  call: (method, params = []) => rpcCall(url, method, params),
  getBlockNumber: async () => parseHex(await rpcCall<string>(url, 'ghost_blockNumber')),
  getChainId: async () => parseHex(await rpcCall<string>(url, 'ghost_chainId')),
  getGasPrice: async () => parseHex(await rpcCall<string>(url, 'ghost_gasPrice')),
  getBalance: async (address: string) => parseHex(await rpcCall<string>(url, 'ghost_getBalance', [address, 'latest'])),
  sendRawTransaction: async (tx: string) => rpcCall<string>(url, 'ghost_sendTransaction', [tx])
});

export type ChainConfig = {
  id: string;
  name: string;
  rpcUrl: string;
  kind: 'L1' | 'L2' | 'L3';
};

export const defineChain = (config: ChainConfig) => config;

// ─── Cosmos SDK (GhostChain sovereign chain) client ──────────────────────────
export {
  CosmosClient,
  createCosmosClient,
  GhostChainNetworks,
} from './cosmos-client.js';
export type {
  CosmosClientConfig,
  GhostProposal,
  GhostProposalStatus,
  BankBalance,
  AccountInfo,
  IBCChannel,
  TxBroadcastResult,
  GhostNetwork,
} from './cosmos-client.js';
