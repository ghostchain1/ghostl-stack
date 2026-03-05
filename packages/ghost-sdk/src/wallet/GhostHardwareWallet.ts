/**
 * GhostHardwareWallet
 *
 * Abstract hardware wallet interface for GhostStack.
 *
 * Defines the contract that hardware signer adapters must implement.
 * Provides a stub implementation (GhostLedgerStub) for testing and
 * a software-fallback implementation that wraps GhostNativeWallet.
 *
 * Actual hardware integration (Ledger HID, Trezor Connect) requires
 * platform-specific transport packages and is intentionally kept
 * outside the core SDK to avoid mandatory native dependencies.
 *
 * Usage with stub (testing):
 *   const hw = new GhostSoftwareHardwareWallet("0xprivkey");
 *   const addr = await hw.getAddress();
 *   const sig  = await hw.signTransaction(txRequest);
 *
 * Usage with real hardware (Ledger):
 *   // import { GhostLedgerWallet } from "@ghostchain/sdk-ledger";
 *   // const hw = new GhostLedgerWallet(transport, "m/44'/924'/0'/0/0");
 */

import type { GhostTxRequest } from "../native/types.js";

// ── Core interface ─────────────────────────────────────────────────────────────

export interface GhostHardwareWallet {
  /** Derivation path used by this wallet instance. */
  readonly derivationPath: string;
  /** Hardware device model name, e.g. "Ledger Nano X" */
  readonly deviceName:     string;

  /** Return the address associated with derivationPath. */
  getAddress(): Promise<string>;

  /**
   * Sign a plain message (UTF-8 string or Uint8Array).
   * Returns a hex signature string.
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Sign a transaction object.
   * Returns the signed raw transaction as a hex string.
   */
  signTransaction(tx: GhostTxRequest): Promise<string>;

  /**
   * Sign a typed-data payload (EIP-712 compatible).
   * Returns a hex signature string.
   */
  signTypedData(domain: Eip712Domain, types: Record<string, Eip712Type[]>, value: Record<string, unknown>): Promise<string>;

  /** Return true if the device is connected and ready to sign. */
  isConnected(): Promise<boolean>;
}

// ── EIP-712 helper types ──────────────────────────────────────────────────────

export interface Eip712Domain {
  name?:              string;
  version?:           string;
  chainId?:           number | bigint;
  verifyingContract?: string;
  salt?:              string;
}

export interface Eip712Type {
  name: string;
  type: string;
}

// ── Software fallback implementation ──────────────────────────────────────────

/**
 * Software-backed hardware wallet shim.
 * Implements the GhostHardwareWallet interface using an in-memory private key.
 * Intended for testing and CI environments — NOT for production key handling.
 */
export class GhostSoftwareHardwareWallet implements GhostHardwareWallet {
  readonly derivationPath: string;
  readonly deviceName = "GhostSoftwareHardwareWallet (test)";

  private readonly _privateKey: string;

  constructor(privateKey: string, derivationPath = "m/44'/924'/0'/0/0") {
    this._privateKey    = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    this.derivationPath = derivationPath;
  }

  async getAddress(): Promise<string> {
    const { computeAddress } = await _secp();
    return computeAddress(this._privateKey);
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const { signMessage } = await _secp();
    return signMessage(this._privateKey, message);
  }

  async signTransaction(tx: GhostTxRequest): Promise<string> {
    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
    const { GhostNativeProvider } = await import("../native/GhostNativeProvider.js");
    const provider = new GhostNativeProvider({ layer: "L2" });
    const wallet   = new GhostNativeWallet(this._privateKey, provider);
    return wallet.signTransaction(tx);
  }

  async signTypedData(
    domain: Eip712Domain,
    types: Record<string, Eip712Type[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    // Minimal EIP-712 via ghost (ethers alias)
    const { TypedDataEncoder } = await import("ghost");
    const encoder = TypedDataEncoder.from(types);
    const hash    = TypedDataEncoder.hash(domain as Parameters<typeof TypedDataEncoder.hash>[0], types, value);
    const { signMessage } = await _secp();
    return signMessage(this._privateKey, Buffer.from(hash.slice(2), "hex"));
  }

  async isConnected(): Promise<boolean> {
    return true; // Software wallet is always "connected"
  }
}

// ── Base class for real hardware adapters ─────────────────────────────────────

/**
 * Extend this to build a real hardware wallet adapter (Ledger, Trezor, etc.).
 * Provides default implementations for isConnected() and error formatting.
 */
export abstract class GhostHardwareWalletBase implements GhostHardwareWallet {
  abstract readonly derivationPath: string;
  abstract readonly deviceName:     string;
  abstract getAddress():     Promise<string>;
  abstract signMessage(m: string | Uint8Array): Promise<string>;
  abstract signTransaction(tx: GhostTxRequest): Promise<string>;
  abstract signTypedData(d: Eip712Domain, t: Record<string, Eip712Type[]>, v: Record<string, unknown>): Promise<string>;

  async isConnected(): Promise<boolean> {
    try {
      await this.getAddress();
      return true;
    } catch {
      return false;
    }
  }

  protected _err(method: string, cause?: unknown): Error {
    const msg = cause instanceof Error ? cause.message : String(cause ?? "Unknown error");
    return new Error(`[${this.deviceName}] ${method} failed: ${msg}`);
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function _secp(): Promise<{
  computeAddress: (key: string) => string;
  signMessage: (key: string, msg: string | Uint8Array) => string;
}> {
  const { secp256k1 }       = await import("@noble/curves/secp256k1");
  const { keccak_256 }      = await import("@noble/hashes/sha3");

  function computeAddress(key: string): string {
    const priv    = Buffer.from(key.replace(/^0x/, ""), "hex");
    const pub     = secp256k1.getPublicKey(priv, false).slice(1); // uncompressed, drop 0x04
    const hashed  = keccak_256(pub);
    return "0x" + Buffer.from(hashed).slice(12).toString("hex");
  }

  function signMessage(key: string, msg: string | Uint8Array): string {
    const priv    = Buffer.from(key.replace(/^0x/, ""), "hex");
    const payload = typeof msg === "string"
      ? Buffer.from(msg)
      : Buffer.from(msg);
    const hash    = keccak_256(payload);
    const sig     = secp256k1.sign(hash, priv);
    const r       = sig.r.toString(16).padStart(64, "0");
    const s       = sig.s.toString(16).padStart(64, "0");
    const v       = (sig.recovery! + 27).toString(16).padStart(2, "0");
    return `0x${r}${s}${v}`;
  }

  return { computeAddress, signMessage };
}
