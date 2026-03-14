// ─────────────────────────────────────────────────────────────────────────────
// Ghost ethers-compat – Primitive Types
// Drop-in replacements for ethers.js BigNumberish, BytesLike, etc.
// ─────────────────────────────────────────────────────────────────────────────

// ─── BigNumberish ────────────────────────────────────────────────────────────
/** Any value representable as a BigInt: number, string ("0x…" or decimal), or bigint. */
export type BigNumberish = bigint | number | string;

export function toBigInt(value: BigNumberish): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  // hex string or decimal string
  if (typeof value === "string") {
    return value.startsWith("0x") || value.startsWith("0X")
      ? BigInt(value)
      : BigInt(value);
  }
  throw new TypeError(`Cannot convert ${typeof value} to bigint`);
}

export function toNumber(value: BigNumberish): number {
  return Number(toBigInt(value));
}

// ─── BytesLike ───────────────────────────────────────────────────────────────
/** Any value representable as raw bytes: hex string or Uint8Array. */
export type BytesLike = string | Uint8Array;

export function toBytes(value: BytesLike): Uint8Array {
  if (value instanceof Uint8Array) return value;
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0) throw new Error("BytesLike: odd-length hex string");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function toHexString(value: BytesLike): string {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value.toLowerCase() : "0x" + value.toLowerCase();
  }
  return "0x" + Buffer.from(value).toString("hex");
}

// ─── TransactionRequest ──────────────────────────────────────────────────────
/** ethers-compatible transaction request. */
export interface TransactionRequest {
  to?: string;
  from?: string;
  nonce?: BigNumberish;
  gasLimit?: BigNumberish;
  gasPrice?: BigNumberish;
  data?: BytesLike;
  value?: BigNumberish;
  chainId?: BigNumberish;
  type?: number;
  maxFeePerGas?: BigNumberish;
  maxPriorityFeePerGas?: BigNumberish;
  accessList?: Array<{ address: string; storageKeys: string[] }>;
}

// ─── TransactionReceipt ──────────────────────────────────────────────────────
export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  removed: boolean;
}

export interface TransactionReceipt {
  hash: string;               // ethers v6 uses `hash` (not `transactionHash`)
  blockHash: string;
  blockNumber: number;
  index: number;              // transactionIndex
  from: string;
  to: string | null;
  contractAddress: string | null;
  gasUsed: bigint;
  cumulativeGasUsed: bigint;
  effectiveGasPrice: bigint;
  status: 0 | 1 | null;
  logs: Log[];
  logsBloom: string;
  type: number;
}

// ─── ContractTransactionResponse ─────────────────────────────────────────────
export interface ContractTransactionResponse {
  hash: string;
  blockNumber: number | null;
  blockHash: string | null;
  from: string;
  to: string | null;
  nonce: number;
  gasLimit: bigint;
  gasPrice: bigint | null;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  value: bigint;
  data: string;
  chainId: bigint;
  type: number;
  /**
   * Wait for the transaction to be mined and return its receipt.
   * @param confirms number of confirmations to wait for (default 1)
   */
  wait(confirms?: number): Promise<TransactionReceipt>;
  /**
   * Returns a JSON-serialisable form of this response (no circular refs).
   */
  toJSON(): Record<string, unknown>;
}
