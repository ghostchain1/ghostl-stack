/**
 * GhostHDWallet — BIP-32/39/44 hierarchical deterministic wallet.
 *
 * Derives child keys from a mnemonic using BIP-39 (wordlist) and BIP-32
 * (HMAC-SHA512 key derivation). Zero external dependencies beyond @noble/curves.
 *
 * Default derivation path: m/44'/60'/0'/0/{index}
 *
 * Usage:
 *   const hd = await GhostHDWallet.fromMnemonic("word word word ...")
 *   const wallet = hd.deriveAccount(0)   // first account
 *   const wallet2 = hd.deriveAccount(1)  // second account
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { GhostNativeWallet } from "../native/GhostNativeWallet.js";
import { GhostAccount } from "./GhostAccount.js";
import type { Hex, GhostAddress } from "../native/types.js";
import { bytesToHex } from "../native/bytes.js";
import { add0x } from "../native/hex.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

// Default GhostChain HD path (same as Ethereum BIP-44 — chains are EVM compatible)
export const GHOST_HD_PATH = "m/44'/60'/0'/0";

export type GhostHDAccount = {
  index: number;
  address: GhostAddress;
  privateKey: Hex;
  path: string;
  wallet: GhostNativeWallet;
};

export class GhostHDWallet {
  private readonly seed: Uint8Array;

  private constructor(seed: Uint8Array) {
    this.seed = seed;
  }

  /** Create from a BIP-39 mnemonic phrase. */
  static async fromMnemonic(mnemonic: string, password = ""): Promise<GhostHDWallet> {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length < 12 || words.length % 3 !== 0) {
      throw new GhostValidationError("Mnemonic must be 12/15/18/21/24 words");
    }
    // BIP-39: derive seed using PBKDF2-HMAC-SHA512
    const mnemonicBytes = new TextEncoder().encode(mnemonic.normalize("NFKD"));
    const saltBytes = new TextEncoder().encode(("mnemonic" + password).normalize("NFKD"));
    const seed = pbkdf2(sha512, mnemonicBytes, saltBytes, { c: 2048, dkLen: 64 });
    return new GhostHDWallet(seed);
  }

  /** Create from a raw 64-byte seed (hex). */
  static fromSeedHex(seedHex: Hex): GhostHDWallet {
    if (!/^0x[0-9a-fA-F]{128}$/.test(seedHex)) {
      throw new GhostValidationError("Seed must be 64 bytes (128 hex chars)");
    }
    const seed = Buffer.from(seedHex.slice(2), "hex");
    return new GhostHDWallet(seed);
  }

  /**
   * Derive a GhostNativeWallet at a given account index.
   * Path: m/44'/60'/0'/0/{index}
   */
  deriveAccount(index: number, basePath = GHOST_HD_PATH): GhostHDAccount {
    const path = `${basePath}/${index}`;
    const privateKey = this._derivePath(path);
    const privHex = add0x(bytesToHex(privateKey)) as Hex;
    const wallet = new GhostNativeWallet(privHex);
    return { index, address: wallet.address, privateKey: privHex, path, wallet };
  }

  /** Derive a GhostAccount at a given account index. */
  deriveGhostAccount(index: number, chainId?: number, basePath = GHOST_HD_PATH): GhostAccount {
    const path = `${basePath}/${index}`;
    const privateKey = this._derivePath(path);
    const privHex = add0x(bytesToHex(privateKey)) as Hex;
    return GhostAccount.fromPrivateKey(privHex, chainId);
  }

  /** Derive an array of accounts. */
  deriveAccounts(count: number, startIndex = 0): GhostHDAccount[] {
    return Array.from({ length: count }, (_, i) => this.deriveAccount(startIndex + i));
  }

  // ── Internal BIP-32 derivation ────────────────────────────────────────────

  private _derivePath(path: string): Uint8Array {
    // Parse: m/44'/60'/0'/0/0
    const parts = path.replace(/^m\//, "").split("/");
    let { key, chainCode } = this._masterKey();

    for (const part of parts) {
      const hardened = part.endsWith("'");
      const index = parseInt(part.replace("'", ""), 10);
      if (isNaN(index)) throw new GhostValidationError(`Invalid HD path segment: ${part}`);
      const childIndex = hardened ? index + 0x80000000 : index;
      ({ key, chainCode } = this._childKey(key, chainCode, childIndex, hardened));
    }

    return key;
  }

  private _masterKey(): { key: Uint8Array; chainCode: Uint8Array } {
    const I = hmac(sha512, new TextEncoder().encode("Bitcoin seed"), this.seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }

  private _childKey(
    parentKey: Uint8Array,
    parentChain: Uint8Array,
    index: number,
    hardened: boolean
  ): { key: Uint8Array; chainCode: Uint8Array } {
    const data = new Uint8Array(37);
    if (hardened) {
      data[0] = 0x00;
      data.set(parentKey, 1);
    } else {
      // compressed public key
      const pub = secp256k1.getPublicKey(parentKey, true);
      data.set(pub, 0);
    }
    data[33] = (index >>> 24) & 0xff;
    data[34] = (index >>> 16) & 0xff;
    data[35] = (index >>> 8) & 0xff;
    data[36] = index & 0xff;

    const I = hmac(sha512, parentChain, data);
    const IL = I.slice(0, 32);
    const IR = I.slice(32);

    // child key = (IL + parentKey) mod n
    const n = secp256k1.CURVE.n;
    const ILn = BigInt("0x" + bytesToHex(IL));
    const pk  = BigInt("0x" + bytesToHex(parentKey));
    const child = (ILn + pk) % n;

    const childBytes = new Uint8Array(32);
    let x = child;
    for (let i = 31; i >= 0; i--) { childBytes[i] = Number(x & 0xffn); x >>= 8n; }

    return { key: childBytes, chainCode: IR };
  }
}

/** Generate a random 12-word mnemonic (uses crypto.getRandomValues). */
export function generateMnemonic(words: string[]): string {
  if (words.length < 2048) throw new GhostValidationError("Word list must have at least 2048 words");
  const entropy = crypto.getRandomValues(new Uint8Array(16)); // 128 bits → 12 words
  const checksumHash = sha256(entropy);
  const checksumBits = checksumHash[0]! >> 4; // 4 bits checksum

  let bits = "";
  for (const b of entropy) bits += b.toString(2).padStart(8, "0");
  bits += checksumBits.toString(2).padStart(4, "0");

  const result: string[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = parseInt(bits.slice(i * 11, (i + 1) * 11), 2);
    result.push(words[idx]!);
  }
  return result.join(" ");
}
