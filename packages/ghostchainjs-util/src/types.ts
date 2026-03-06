/**
 * @file types.ts
 * @module @ghostchain/ghostchain-util/types
 *
 * Primitive branded types for GhostChain utilities.
 * All address/hash values in GhostChain are strings — these phantom-branded
 * aliases make mis-assignments detectable at the TypeScript level.
 */

// ─── Branded scalar types ────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** A 0x-prefixed 20-byte hex string representing a GhostChain address. */
export type GhostAddress = Brand<string, "GhostAddress">;

/** A 0x-prefixed 32-byte hex string (transaction or block hash). */
export type GhostHash = Brand<string, "GhostHash">;

/** Any 0x-prefixed hex string of arbitrary length. */
export type GhostHex = Brand<string, "GhostHex">;

/** A bigint, number, or decimal/hex string used as a numeric input. */
export type GhostBigNumberish = bigint | number | string;

/** Raw bytes as Uint8Array or 0x-prefixed hex string. */
export type GhostBytesLike = Uint8Array | string;

// ─── Transaction types ───────────────────────────────────────────────────────

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
  chainId?: number;
  /** EIP-2718 tx type: 0 = legacy, 1 = EIP-2930, 2 = EIP-1559 */
  type?: 0 | 1 | 2;
}

export interface GhostTransactionReceipt {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  contractAddress: string | null;
  /** 1 = success, 0 = revert */
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

// ─── ABI types ───────────────────────────────────────────────────────────────

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

// ─── EIP-712 types ───────────────────────────────────────────────────────────

export interface GhostTypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface GhostTypedDataField {
  name: string;
  type: string;
}

export interface GhostTypedDataTypes {
  [typeName: string]: GhostTypedDataField[];
}

// ─── Signature type ──────────────────────────────────────────────────────────

export interface GhostSignature {
  r: string;
  s: string;
  v: number;
  compact: string;
  full: string;
}

// ─── Chain config ─────────────────────────────────────────────────────────────

export interface GhostChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  fallbackRpcs?: string[];
  isMainnet?: boolean;
}
