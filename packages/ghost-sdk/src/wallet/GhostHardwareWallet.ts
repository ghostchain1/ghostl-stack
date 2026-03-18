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
    const key    = this._privateKey.startsWith("0x") ? this._privateKey as `0x${string}` : `0x${this._privateKey}` as `0x${string}`;
    const { computeAddress } = await _secp();
    return computeAddress(key);
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
    const key    = this._privateKey.startsWith("0x") ? this._privateKey as `0x${string}` : `0x${this._privateKey}` as `0x${string}`;
    const wallet = new GhostNativeWallet(key, {});
    const bytes  = typeof message === "string" ? new TextEncoder().encode(message) : message;
    return wallet.signMessage(bytes);
  }

  async signTransaction(tx: GhostTxRequest): Promise<string> {
    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
    const key    = this._privateKey.startsWith("0x") ? this._privateKey as `0x${string}` : `0x${this._privateKey}` as `0x${string}`;
    const wallet = new GhostNativeWallet(key, {});
    return wallet.signEip1559Tx(tx);
  }

  async signTypedData(
    domain: Eip712Domain,
    types: Record<string, Eip712Type[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const { keccak_256 }  = await import("@noble/hashes/sha3");

    // ── helpers ─────────────────────────────────────────────────────────────
    const hexToB = (hex: string): Uint8Array => {
      const h = hex.replace(/^0x/i, "");
      const b = new Uint8Array(h.length / 2);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return b;
    };
    const pad32 = (b: Uint8Array): Uint8Array => {
      if (b.length >= 32) return b.slice(b.length - 32);
      const o = new Uint8Array(32); o.set(b, 32 - b.length); return o;
    };
    const encUint = (n: bigint | number | string): Uint8Array =>
      pad32(hexToB(BigInt(n as string | number | bigint).toString(16).padStart(2, "0")));

    // ── Build full type registry including EIP-712 domain ────────────────────
    const domainFields: Eip712Type[] = [];
    if (domain.name !== undefined)              domainFields.push({ name: "name",              type: "string"  });
    if (domain.version !== undefined)           domainFields.push({ name: "version",           type: "string"  });
    if (domain.chainId !== undefined)           domainFields.push({ name: "chainId",           type: "uint256" });
    if (domain.verifyingContract !== undefined) domainFields.push({ name: "verifyingContract", type: "address" });
    if (domain.salt !== undefined)              domainFields.push({ name: "salt",              type: "bytes32" });
    const allTypes: Record<string, Eip712Type[]> = { EIP712Domain: domainFields, ...types };

    // ── Type string builder (deterministic, sorted deps) ────────────────────
    const buildTypeStr = (name: string): string => {
      const fields = (allTypes[name] ?? []).map(f => `${f.type} ${f.name}`).join(",");
      const deps = new Set<string>();
      const collect = (t: string) => {
        for (const f of allTypes[t] ?? []) {
          const base = f.type.endsWith("[]") ? f.type.slice(0, -2) : f.type;
          if (allTypes[base] && !deps.has(base)) { deps.add(base); collect(base); }
        }
      };
      collect(name);
      const depStr = [...deps].sort()
        .map(d => `${d}(${(allTypes[d] ?? []).map(f => `${f.type} ${f.name}`).join(",")})`)
        .join("");
      return `${name}(${fields})${depStr}`;
    };

    const typeHash = (name: string): Uint8Array =>
      keccak_256(new TextEncoder().encode(buildTypeStr(name)));

    // ── Value encoder ────────────────────────────────────────────────────────
    const encVal = (type: string, v: unknown): Uint8Array => {
      if (type === "address")               return pad32(hexToB(v as string));
      if (/^u?int/.test(type))              return encUint(v as bigint | number | string);
      if (type === "bool")                  return encUint(v ? 1n : 0n);
      if (type === "bytes32")               return pad32(hexToB(v as string));
      if (/^bytes\d/.test(type))            return pad32(hexToB(v as string));
      if (type === "string")                return keccak_256(new TextEncoder().encode(v as string));
      if (type === "bytes")                 return keccak_256(hexToB(v as string));
      if (allTypes[type])                   return hashStruct(type, v as Record<string, unknown>);
      return new Uint8Array(32);
    };

    // ── Struct hasher ────────────────────────────────────────────────────────
    const hashStruct = (name: string, data: Record<string, unknown>): Uint8Array => {
      const parts = [typeHash(name), ...(allTypes[name] ?? []).map(f => encVal(f.type, data[f.name]))];
      const buf = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
      let off = 0; for (const p of parts) { buf.set(p, off); off += p.length; }
      return keccak_256(buf);
    };

    const domainSep  = hashStruct("EIP712Domain", domain as unknown as Record<string, unknown>);
    const primaryType = Object.keys(types)[0] ?? "";
    const structHash  = hashStruct(primaryType, value);

    // "\x19\x01" + domainSep (32) + structHash (32) = 66 bytes
    const msg = new Uint8Array(66);
    msg[0] = 0x19; msg[1] = 0x01;
    msg.set(domainSep, 2); msg.set(structHash, 34);
    const digest = keccak_256(msg);

    const privK = hexToB(this._privateKey);
    const sig   = secp256k1.sign(digest, privK, { lowS: true });
    const r     = sig.r.toString(16).padStart(64, "0");
    const s     = sig.s.toString(16).padStart(64, "0");
    const v     = sig.recovery.toString(16).padStart(2, "0");
    return `0x${r}${s}${v}`;
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
}> {
  const { secp256k1 }  = await import("@noble/curves/secp256k1");
  const { keccak_256 } = await import("@noble/hashes/sha3");

  function computeAddress(key: string): string {
    const priv   = Buffer.from(key.replace(/^0x/, ""), "hex");
    const pub    = secp256k1.getPublicKey(priv, false).slice(1);
    const hashed = keccak_256(pub);
    return "0x" + Buffer.from(hashed).slice(12).toString("hex");
  }

  return { computeAddress };
}
