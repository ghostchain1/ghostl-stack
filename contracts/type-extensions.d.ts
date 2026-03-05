/**
 * type-extensions.d.ts
 *
 * 1. Augments Hardhat's HardhatRuntimeEnvironment so that
 *      import { ghost } from "hardhat";
 *    works as a type-safe value with Ghost-branded helpers.
 *
 * 2. Declares a global `namespace ghost` (via `declare global`) that mirrors
 *    the Ghost SDK type surface, allowing scripts to use `ghost.Signer`,
 *    `ghost.Contract`, `ghost.TransactionReceipt`, etc. in TYPE POSITIONS.
 *
 * NOTE: All types are sourced from @ghostchain/ghost-sdk-core — the Ghost-native
 * SDK — rather than ethers.js, completing the move to sovereign GhostChain tooling.
 */
import type {
  ContractFactory,
  BaseContract,
  BigNumberish,
  Contract,
  AbiCoder,
  Interface,
  JsonRpcProvider,
  Provider,
  TransactionReceipt,
  TransactionRequest,
  ContractTransactionResponse,
  TypedDataEncoder,
  Wallet,
  BytesLike,
} from "@ghostchain/ghost-sdk-core";

// ── Augmented Signer with synchronous `.address` (HardhatEthersSigner compat)

/** Hardhat returns enhanced signers that expose a synchronous `.address`. */
type GhostSigner = import("@ghostchain/ghost-sdk-core").Wallet & {
  readonly address: string;
};

// ── GhostFeeData

interface GhostFeeData {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasPrice: bigint | null;
}

// ── GhostHre — shape of the `ghost` object injected by hardhat-ghost

interface GhostHre {
  // signers
  getSigners(): Promise<GhostSigner[]>;
  getSigner(address: string): Promise<GhostSigner>;

  // factories / attachment
  getContractFactory(name: string, signer?: GhostSigner): Promise<ContractFactory>;
  getContractFactoryFromArtifact(
    artifact: { abi: unknown[]; bytecode: string },
    signer?: GhostSigner,
  ): Promise<ContractFactory>;
  getContractAt(name: string, address: string, signer?: GhostSigner): Promise<BaseContract>;
  getContract(name: string, address: string, signer?: GhostSigner): Promise<BaseContract>;

  // unit helpers
  parseGhost(value: string): bigint;
  formatGhost(value: BigNumberish): string;
  parseGhostGwei(value: string): bigint;
  formatGhostGwei(value: BigNumberish): string;
  parseEther(value: string): bigint;
  parseUnits(value: string, unitName?: string | bigint): bigint;

  units: { GhostWei: bigint; GhostGwei: bigint; GhostOne: bigint };

  // gas engine
  GasEngine: new (provider: unknown) => {
    getFeeData(): Promise<GhostFeeData>;
    estimateGas(tx: object): Promise<bigint>;
  };

  // ethers static utilities re-exported under ghost.*
  getAddress(address: string): string;
  isAddress(value: unknown): value is string;
  isHexString(value: unknown, length?: number): boolean;
  keccak256(data: BytesLike): string;
  id(text: string): string;
  solidityPacked(types: string[], values: unknown[]): string;
  toBeHex(value: BigNumberish, width?: number | bigint): string;
  toUtf8Bytes(text: string): Uint8Array;
  zeroPadValue(value: BytesLike, length: number): string;
  dataSlice(data: BytesLike, start?: number, end?: number): string;

  // ethers classes
  AbiCoder: typeof AbiCoder;
  Contract: typeof Contract;
  Interface: typeof Interface;
  TypedDataEncoder: typeof TypedDataEncoder;
  JsonRpcProvider: typeof JsonRpcProvider;
  Wallet: typeof Wallet;

  // constants
  ZeroAddress: string;
  ZeroHash: string;
  MaxUint256: bigint;

  provider: unknown;
  Networks: unknown;
}

// ── HRE augmentation ──────────────────────────────────────────────────────

declare module "hardhat/types" {
  interface HardhatRuntimeEnvironment {
    ghost: GhostHre;
  }
}

// ── Global type namespace `ghost.*` for TYPE POSITIONS ───────────────────
//
// Because this file has top-level imports (module file), global declarations
// must be wrapped in `declare global { ... }`.  This makes ghost.Signer etc.
// available in scripts without an extra import.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ghost {
    type AbiCoder                    = import("@ghostchain/ghost-sdk-core").AbiCoder;
    type Contract                    = import("@ghostchain/ghost-sdk-core").Contract;
    type ContractFactory             = import("@ghostchain/ghost-sdk-core").ContractFactory;
    type ContractTransactionResponse = import("@ghostchain/ghost-sdk-core").ContractTransactionResponse;
    type Interface                   = import("@ghostchain/ghost-sdk-core").Interface;
    /** ABI fragment array or human-readable ABI strings */
    type InterfaceAbi                = import("@ghostchain/ghost-sdk-core").JsonFragment[] | string[];
    type JsonRpcProvider             = import("@ghostchain/ghost-sdk-core").JsonRpcProvider;
    type Log                         = import("@ghostchain/ghost-sdk-core").Log;
    type Provider                    = import("@ghostchain/ghost-sdk-core").Provider;
    /** Signer with synchronous `.address` (Hardhat HardhatEthersSigner). */
    type Signer                      = GhostSigner;
    type TransactionReceipt          = import("@ghostchain/ghost-sdk-core").TransactionReceipt;
    type TransactionRequest          = import("@ghostchain/ghost-sdk-core").TransactionRequest;
    type TypedDataEncoder            = import("@ghostchain/ghost-sdk-core").TypedDataEncoder;
    type Wallet                      = import("@ghostchain/ghost-sdk-core").Wallet;

    const ZeroHash: string;
    const ZeroAddress: string;
    const MaxUint256: bigint;
  }
}
