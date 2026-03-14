export type Hex = `0x${string}`;
export type GhostAddress = `0x${string}`;
export type GhostChainId = number;

export type GhostRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown[];
};

export type GhostRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export type GhostBlockTag = "latest" | "pending" | "earliest" | Hex;

export type GhostFeeSuggestion = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFeePerGas?: bigint;
};

export type GhostTxRequest = {
  from?: GhostAddress;
  to?: GhostAddress;
  value?: bigint;
  data?: Hex;
  nonce?: number;
  gasLimit?: bigint;
  chainId?: GhostChainId;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  accessList?: Array<{ address: GhostAddress; storageKeys: Hex[] }>;
};

export type GhostTxReceipt = {
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  from: GhostAddress;
  to: GhostAddress | null;
  cumulativeGasUsed: Hex;
  gasUsed: Hex;
  status?: Hex;
  contractAddress?: GhostAddress | null;
  logs: Array<{
    address: GhostAddress;
    topics: Hex[];
    data: Hex;
    blockNumber: Hex;
    transactionHash: Hex;
    logIndex: Hex;
  }>;
};

export type GhostCallRequest = {
  to: GhostAddress;
  data: Hex;
  from?: GhostAddress;
  value?: bigint;
};

export type GhostLogFilter = {
  address?: GhostAddress | GhostAddress[];
  topics?: (Hex | Hex[] | null)[];
  fromBlock?: GhostBlockTag;
  toBlock?: GhostBlockTag;
};

export type GhostProviderOptions = {
  rpcUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export type GhostWalletOptions = {
  chainId?: GhostChainId;
};
