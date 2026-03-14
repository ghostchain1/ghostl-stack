/**
 * @file index.ts
 * @module @ghostchain/ghostchainjs-util
 *
 * ghostchainjs-util — GhostChain's primitive utility belt.
 *
 * The GhostChain-native replacement for ethereumjs-util. // brand-enforcer-ignore
 * Zero ethers dependency. All functions use native BigInt and Uint8Array.
 *
 * Sub-path imports (preferred for tree-shaking):
 *   import { parseGST } from "@ghostchain/ghostchainjs-util/units";
 *   import { checksumAddress } from "@ghostchain/ghostchainjs-util/address";
 *   import { keccak256Hex } from "@ghostchain/ghostchainjs-util/hash";
 *   import { signHash } from "@ghostchain/ghostchainjs-util/signature";
 *   import { hashTypedData } from "@ghostchain/ghostchainjs-util/eip712";
 *   import { abiEncode } from "@ghostchain/ghostchainjs-util/abi";
 *   import { rlpEncode } from "@ghostchain/ghostchainjs-util/rlp";
 *   import { GhostChainId } from "@ghostchain/ghostchainjs-util/chains";
 *
 * Or the root barrel for convenience:
 *   import { parseGST, checksumAddress, keccak256Hex } from "@ghostchain/ghostchainjs-util";
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  GhostAddress,
  GhostHash,
  GhostHex,
  GhostBigNumberish,
  GhostBytesLike,
  GhostTransactionRequest,
  GhostTransactionReceipt,
  GhostLog,
  GhostBlock,
  GhostABIFragment,
  GhostABIInput,
  GhostTypedDataDomain,
  GhostTypedDataField,
  GhostTypedDataTypes,
  GhostSignature,
  GhostChainConfig,
} from "./types.js";

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  GhostUtilError,
  GhostAddressError,
  GhostHexError,
  GhostABIError,
  GhostSignatureError,
  GhostRLPError,
  GhostUnitError,
} from "./errors.js";

// ─── Hex utilities ────────────────────────────────────────────────────────────
export {
  isHex,
  assertHex,
  stripHexPrefix,
  addHexPrefix,
  toHex,
  toHexPadded,
  fromHex,
  fromHexNumber,
  hexToBytes,
  bytesToHex,
  stringToHex,
  hexToString,
  padLeft,
  padRight,
  hexConcat,
  hexSlice,
} from "./hex.js";

// ─── Address utilities ────────────────────────────────────────────────────────
export {
  isAddress,
  assertAddress,
  checksumAddress,
  isChecksumAddress,
  normalizeAddress,
  zeroAddress,
  isZeroAddress,
  addressToBytes32,
  bytes32ToAddress,
  addressEq,
  bytesToAddress,
  addressToBytes,
} from "./address.js";

// ─── Hash functions ───────────────────────────────────────────────────────────
export {
  keccak256,
  keccak256Hex,
  keccak256Text,
  sha256,
  sha256Hex,
  sha512,
  ripemd160,
  hash160,
  functionSelector,
  eventTopic,
} from "./hash.js";

// ─── Unit conversion ─────────────────────────────────────────────────────────
export {
  GhostUnitsTable,
  parseGhostUnits,
  formatGhostUnits,
  parseGST,
  formatGST,
  parseUnits,
  formatUnits,
  parseGwei,
  formatGwei,
  ONE_GST,
  ONE_GWEI,
  GST_MAX_SUPPLY,
} from "./units.js";
export type { GhostUnitName } from "./units.js";

// ─── BigInt math ─────────────────────────────────────────────────────────────
export {
  absBigInt,
  maxBigInt,
  minBigInt,
  clampBigInt,
  divCeil,
  mulDiv,
  mulDivCeil,
  bps,
  percent,
  sqrtBigInt,
  commaFormat,
} from "./math.js";

// ─── ABI codec ────────────────────────────────────────────────────────────────
export {
  abiEncode,
  abiEncodeCall,
  abiDecode,
  ghostABISignature,
  ghostFunctionSelector,
} from "./abi.js";

// ─── RLP codec ───────────────────────────────────────────────────────────────
export { rlpEncode, rlpDecode, rlpDecodeValue } from "./rlp.js";
export type { RlpInput, RlpDecoded } from "./rlp.js";

// ─── Signature utilities ──────────────────────────────────────────────────────
export {
  hashPersonalMessage,
  signHash,
  signMessage,
  recoverAddress,
  recoverPersonalMessage,
  verifySignature,
  verifyPersonalMessage,
  privateKeyToAddress,
  privateKeyToPublicKey,
} from "./signature.js";

// ─── EIP-712 typed data ───────────────────────────────────────────────────────
export {
  encodeType,
  typeHash,
  encodeData,
  hashStruct,
  domainSeparator,
  hashTypedData,
  hashTypedDataHex,
} from "./eip712.js";

// ─── Chain constants ──────────────────────────────────────────────────────────
export {
  GhostChainId,
  GHOST_CHAIN_NAMES,
  GHOST_DEVNET_RPC,
  GHOST_MAINNET_RPC,
  GHOST_CHAINS,
  isGhostChainId,
  isMainnetChain,
  ghostChainLayer,
  ghostChain,
} from "./chains.js";
