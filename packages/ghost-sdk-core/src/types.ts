// ─────────────────────────────────────────────────────────────────────────────
// Ghost SDK Core – Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GhostChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  fallbackRpcs?: string[];
}

export interface GhostTransactionRequest {
  to?: string;
  from?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number | bigint;
  type?: number;
}

export interface GhostTransactionReceipt {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  contractAddress: string | null;
  status: 0 | 1;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: GhostLog[];
}

export interface GhostLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface GhostBlock {
  hash: string;
  parentHash: string;
  number: number;
  timestamp: number;
  gasLimit: bigint;
  gasUsed: bigint;
  miner: string;
  transactions: string[];
}

export interface GhostCallOverride {
  to: string;
  data: string;
  from?: string;
  value?: string;
  gasLimit?: string;
}

export interface GhostTypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: string;
  salt?: string;
}

export interface GhostTypedDataTypes {
  [typeName: string]: GhostTypedDataField[];
}

export interface GhostTypedDataField {
  name: string;
  type: string;
}

export interface GhostABIFragment {
  type: "function" | "event" | "error" | "constructor" | "receive" | "fallback";
  name?: string;
  inputs?: GhostABIInput[];
  outputs?: GhostABIInput[];
  stateMutability?: "pure" | "view" | "nonpayable" | "payable";
  anonymous?: boolean;
}

export interface GhostABIInput {
  name: string;
  type: string;
  components?: GhostABIInput[];
  indexed?: boolean;
}

export interface GhostPolicyRule {
  id: string;
  description: string;
  check: (tx: GhostTransactionRequest) => boolean | Promise<boolean>;
}

export interface GhostAIResponse {
  result: string;
  confidence: number;
  model: string;
  latencyMs: number;
}

export interface GhostTelemetryEvent {
  name: string;
  timestamp: number;
  labels: Record<string, string>;
  value?: number;
}
