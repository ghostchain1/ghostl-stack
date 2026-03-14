/**
 * @ghostchain/ghostchainjs-tx — Transaction types
 *
 * Drop-in replacement for @ethereumjs/tx type definitions. // brand-enforcer-ignore
 * Zero ethers dependency. All encoding is done via @ghostchain/ghostchainjs-rlp.
 */

/** Hex string prefixed with 0x */
export type HexString = `0x${string}`;

/** Byte array or hex string */
export type BytesLike = Uint8Array | HexString | string;

/** Access list entry as per EIP-2930 */
export interface AccessListItem {
  address: HexString;
  storageKeys: HexString[];
}

export type AccessList = AccessListItem[];

// ── Common transaction fields ─────────────────────────────────────────────────

/** Base fields shared across all transaction types */
export interface BaseTxData {
  nonce?: bigint | number | HexString;
  gasLimit?: bigint | number | HexString;
  to?: HexString | null;
  value?: bigint | number | HexString;
  data?: BytesLike;
  /** Chain ID (EIP-155, required for EIP-2930 and EIP-1559) */
  chainId?: bigint | number | HexString;
  /** ECDSA signature v */
  v?: bigint | number | HexString;
  /** ECDSA signature r */
  r?: HexString;
  /** ECDSA signature s */
  s?: HexString;
}

// ── Legacy (type 0) ───────────────────────────────────────────────────────────

/** Legacy pre-EIP-155 / EIP-155 transaction data */
export interface LegacyTxData extends BaseTxData {
  gasPrice?: bigint | number | HexString;
}

// ── EIP-2930 (type 1) ─────────────────────────────────────────────────────────

/** EIP-2930 access-list transaction data */
export interface AccessListEIP2930TxData extends BaseTxData {
  gasPrice?: bigint | number | HexString;
  accessList?: AccessList;
}

// ── EIP-1559 (type 2) ─────────────────────────────────────────────────────────

/** EIP-1559 fee-market transaction data */
export interface FeeMarketEIP1559TxData extends BaseTxData {
  maxFeePerGas?: bigint | number | HexString;
  maxPriorityFeePerGas?: bigint | number | HexString;
  accessList?: AccessList;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type TypedTxData =
  | LegacyTxData
  | AccessListEIP2930TxData
  | FeeMarketEIP1559TxData;

// ── Transaction options ───────────────────────────────────────────────────────

export interface TxOptions {
  /** Perform in-constructor field validation (default: true) */
  freeze?: boolean;
}

// ── Signed result ─────────────────────────────────────────────────────────────

export interface SignedTxResult {
  /** RLP-encoded serialized transaction (incl. type prefix for EIP-2930/1559) */
  serialized: Uint8Array;
  /** Keccak-256 hash of the serialized transaction */
  hash: Uint8Array;
  v: bigint;
  r: Uint8Array;
  s: Uint8Array;
}
