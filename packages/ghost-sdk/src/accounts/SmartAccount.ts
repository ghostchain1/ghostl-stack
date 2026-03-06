/**
 * SmartAccount — ERC-4337 smart account abstraction.
 *
 * Represents a 4337-compatible account: knows its address (counterfactual or
 * deployed), builds UserOperations, and signs them via the provided signer.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import type { GhostSigner } from "../wallet/GhostSigner.js";
import type { HttpProvider } from "../providers/HttpProvider.js";

// ── ERC-4337 types ────────────────────────────────────────────────────────

export interface UserOperation {
  sender: `0x${string}`;
  nonce: bigint;
  initCode: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: `0x${string}`;
  signature: `0x${string}`;
}

export interface UserOperationPartial
  extends Omit<Partial<UserOperation>, "sender"> {
  sender: `0x${string}`;
}

export interface SmartAccountConfig {
  /** Pre-computed or deployed smart account address */
  address: `0x${string}`;
  /** Owner / guardian signer */
  signer: GhostSigner;
  /** JSON-RPC provider for on-chain reads */
  provider: HttpProvider;
  /** EntryPoint contract address (default v0.6) */
  entryPoint?: `0x${string}`;
  /** Account factory address (for counterfactual computation) */
  factory?: `0x${string}`;
  chainId?: number;
}

// EntryPoint v0.6 address (canonical, same on all chains)
export const ENTRY_POINT_V06 =
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;

// EntryPoint v0.7 address
export const ENTRY_POINT_V07 =
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

export class SmartAccount {
  readonly address: `0x${string}`;
  readonly signer: GhostSigner;
  readonly provider: HttpProvider;
  readonly entryPoint: `0x${string}`;
  readonly chainId: number;

  constructor(config: SmartAccountConfig) {
    this.address = config.address;
    this.signer = config.signer;
    this.provider = config.provider;
    this.entryPoint = config.entryPoint ?? ENTRY_POINT_V06;
    this.chainId = config.chainId ?? 1;
  }

  // ── On-chain state ────────────────────────────────────────────────────────

  async isDeployed(): Promise<boolean> {
    const code = await this.provider.getCode(this.address);
    return code !== "0x" && code !== "0x0";
  }

  async getNonce(): Promise<bigint> {
    // EntryPoint getNonce(address sender, uint192 key) selector: 0x35567e1a
    const selector = "35567e1a";
    const addrHex = this.address.slice(2).toLowerCase().padStart(64, "0");
    const keyHex = "".padStart(64, "0"); // key = 0

    const result = await this.provider.call({
      to: this.entryPoint,
      data: `0x${selector}${addrHex}${keyHex}`,
    });

    if (!result || result === "0x") return 0n;
    return BigInt(result);
  }

  // ── UserOperation building ────────────────────────────────────────────────

  buildUserOp(partial: UserOperationPartial): UserOperation {
    return {
      sender: this.address,
      nonce: partial.nonce ?? 0n,
      initCode: partial.initCode ?? "0x",
      callData: partial.callData ?? "0x",
      callGasLimit: partial.callGasLimit ?? 200_000n,
      verificationGasLimit: partial.verificationGasLimit ?? 150_000n,
      preVerificationGas: partial.preVerificationGas ?? 21_000n,
      maxFeePerGas: partial.maxFeePerGas ?? 1_000_000_000n,
      maxPriorityFeePerGas: partial.maxPriorityFeePerGas ?? 1_000_000_000n,
      paymasterAndData: partial.paymasterAndData ?? "0x",
      signature: partial.signature ?? "0x",
    };
  }

  async fillAndSign(partial: UserOperationPartial): Promise<UserOperation> {
    const nonce = partial.nonce ?? (await this.getNonce());
    const userOp = this.buildUserOp({ ...partial, nonce });
    const hash = this.getUserOpHash(userOp);
    // Sign the hash (personal sign via EIP-191)
    const sig = await this.signer.signMessage(
      `0x${Buffer.from(hash.slice(2), "hex").toString("hex")}`,
    );
    return { ...userOp, signature: sig };
  }

  // ── Hash computation ──────────────────────────────────────────────────────

  getUserOpHash(userOp: UserOperation): `0x${string}` {
    const packed = this._packUserOp(userOp);
    const packedBytes = this._hexToBytes(packed);
    const packedHash = keccak_256(packedBytes);

    // Final hash: keccak256(abi.encode(packedHash, entryPoint, chainId))
    const epHex = this.entryPoint.slice(2).toLowerCase().padStart(64, "0");
    const chainHex = this.chainId.toString(16).padStart(64, "0");
    const inner = `${this._bytesToHex(packedHash)}${epHex}${chainHex}`;
    const final = keccak_256(this._hexToBytes(inner));
    return `0x${this._bytesToHex(final)}`;
  }

  private _packUserOp(op: UserOperation): `0x${string}` {
    const sender = op.sender.slice(2).toLowerCase().padStart(64, "0");
    const nonce = op.nonce.toString(16).padStart(64, "0");
    const initCodeHash = this._keccakHex(op.initCode);
    const callDataHash = this._keccakHex(op.callData);
    const callGasLimit = op.callGasLimit.toString(16).padStart(64, "0");
    const verificationGasLimit = op.verificationGasLimit.toString(16).padStart(64, "0");
    const preVerificationGas = op.preVerificationGas.toString(16).padStart(64, "0");
    const maxFeePerGas = op.maxFeePerGas.toString(16).padStart(64, "0");
    const maxPriorityFeePerGas = op.maxPriorityFeePerGas.toString(16).padStart(64, "0");
    const paymasterHash = this._keccakHex(op.paymasterAndData);

    return `0x${sender}${nonce}${initCodeHash}${callDataHash}${callGasLimit}${verificationGasLimit}${preVerificationGas}${maxFeePerGas}${maxPriorityFeePerGas}${paymasterHash}` as `0x${string}`;
  }

  // ── Encode execute call ───────────────────────────────────────────────────

  /**
   * Encode a call to the account's `execute(address,uint256,bytes)` function.
   * Most 4337 accounts (SimpleAccount, Safe) expose this interface.
   */
  encodeExecute(
    target: `0x${string}`,
    value: bigint,
    data: `0x${string}`,
  ): `0x${string}` {
    // execute(address,uint256,bytes) selector = 0xb61d27f6
    const selector = "b61d27f6";
    const targetHex = target.slice(2).toLowerCase().padStart(64, "0");
    const valueHex = value.toString(16).padStart(64, "0");
    const dataOffset = "60".padStart(64, "0"); // 3 * 32 bytes
    const rawData = data.startsWith("0x") ? data.slice(2) : data;
    const dataLen = (rawData.length / 2).toString(16).padStart(64, "0");
    const dataPadded = rawData.padEnd(
      Math.ceil(rawData.length / 64) * 64,
      "0",
    );
    return `0x${selector}${targetHex}${valueHex}${dataOffset}${dataLen}${dataPadded}` as `0x${string}`;
  }

  /**
   * Encode a batch call to `executeBatch(address[],bytes[])`.
   */
  encodeExecuteBatch(
    calls: Array<{ target: `0x${string}`; data: `0x${string}` }>,
  ): `0x${string}` {
    // executeBatch(address[],bytes[]) selector = 0x18dfb3c7
    const selector = "18dfb3c7";

    const n = calls.length;
    const addrArrayOffset = "40".padStart(64, "0"); // offset for address[] = 2*32
    const dataArrayBodyStart = 32 + n * 32; // after address array head
    const dataArrayOffset = dataArrayBodyStart.toString(16).padStart(64, "0");

    // address array
    const addrLen = n.toString(16).padStart(64, "0");
    const addrs = calls.map((c) => c.target.slice(2).toLowerCase().padStart(64, "0")).join("");

    // bytes[] array
    const dataLen = n.toString(16).padStart(64, "0");
    const dataBodyStart = n * 32; // head section within the array
    let dataHeads = "";
    let dataBodies = "";
    let offset = dataBodyStart;
    for (const call of calls) {
      const raw = call.data.startsWith("0x") ? call.data.slice(2) : call.data;
      const byteLen = raw.length / 2;
      const padded = raw.padEnd(Math.ceil(raw.length / 64) * 64, "0");
      dataHeads += offset.toString(16).padStart(64, "0");
      dataBodies += byteLen.toString(16).padStart(64, "0") + padded;
      offset += 32 + Math.ceil(byteLen / 32) * 32;
    }

    return `0x${selector}${addrArrayOffset}${dataArrayOffset}${addrLen}${addrs}${dataLen}${dataHeads}${dataBodies}` as `0x${string}`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _hexToBytes(hex: `0x${string}` | string): Uint8Array {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private _bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private _keccakHex(hex: `0x${string}` | string): string {
    const bytes = this._hexToBytes(hex);
    return this._bytesToHex(keccak_256(bytes));
  }
}
