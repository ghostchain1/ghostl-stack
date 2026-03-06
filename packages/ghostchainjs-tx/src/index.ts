/**
 * @ghostchain/ghostchainjs-tx
 *
 * GhostChain transaction library — drop-in for @ethereumjs/tx. // brand-enforcer-ignore
 *
 * Implements Legacy (type 0), EIP-2930 (type 1), and EIP-1559 (type 2)
 * transaction encoding and ECDSA signing with zero ethers dependency.
 *
 * All cryptography is performed via @noble/curves (secp256k1) and
 * @noble/hashes (keccak-256). RLP encoding via @ghostchain/ghostchainjs-rlp.
 *
 * Usage:
 *
 *   // EIP-1559
 *   import { FeeMarketEIP1559Transaction } from "@ghostchain/ghostchainjs-tx";
 *   const tx = FeeMarketEIP1559Transaction.fromTxData({
 *     chainId: 14000101n,
 *     nonce: 0n,
 *     maxPriorityFeePerGas: 1_000_000_000n,
 *     maxFeePerGas: 20_000_000_000n,
 *     gasLimit: 21000n,
 *     to: "0xRecipientAddress",
 *     value: 1_000_000_000_000_000_000n,
 *   });
 *   const signed = tx.sign(privateKey);
 *   const raw = signed.serialize();
 *
 *   // Legacy
 *   import { LegacyTransaction } from "@ghostchain/ghostchainjs-tx";
 *   const legacy = LegacyTransaction.fromTxData({ ... }).sign(privateKey);
 */

export { LegacyTransaction, LegacyTransaction as Transaction } from "./legacy.js";
export { AccessListEIP2930Transaction } from "./eip2930.js";
export { FeeMarketEIP1559Transaction } from "./eip1559.js";

export type {
  LegacyTxData,
  AccessListEIP2930TxData,
  FeeMarketEIP1559TxData,
  TypedTxData,
  TypedTransaction,
  AccessList,
  AccessListItem,
  TxOptions,
  SignedTxResult,
  HexString,
  BytesLike,
} from "./types.js";

/** Upstream @ethereumjs/tx compat: union of all supported transaction types */ // brand-enforcer-ignore
export type TypedTransaction =
  | import("./legacy.js").LegacyTransaction
  | import("./eip2930.js").AccessListEIP2930Transaction
  | import("./eip1559.js").FeeMarketEIP1559Transaction;
