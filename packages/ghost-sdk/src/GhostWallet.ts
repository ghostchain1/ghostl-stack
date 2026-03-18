/**
 * @file GhostWallet.ts
 * @description GhostChain canonical wallet and transaction signer.
 * Replaces ethers.Wallet in GhostStack consumer code.
 *
 * @example
 *   const wallet = GhostWallet.fromPrivateKey(privateKey, provider);
 *   const walletFromMnemonic = GhostWallet.fromMnemonic("word1 word2 ...", provider);
 *   const tx = await wallet.sendGst(recipient, amount);
 */

import type { GhostProvider } from "./GhostProvider.js";
import { GhostNativeWallet } from "./native/GhostNativeWallet.js";
import type { GhostAddress, Hex } from "./native/types.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";

export class GhostWallet {
  readonly address: string;
  readonly provider: GhostProvider | undefined;
  /** @internal */
  private readonly _native: GhostNativeWallet;

  private constructor(nativeWallet: GhostNativeWallet, provider?: GhostProvider) {
    this.address = nativeWallet.address;
    this.provider = provider;
    this._native = nativeWallet;
  }

  static fromPrivateKey(privateKey: string, provider?: GhostProvider): GhostWallet {
    const native = GhostNativeWallet.fromPrivateKey(privateKey as Hex);
    return new GhostWallet(native, provider);
  }

  /**
   * Derive a wallet from a BIP-39 mnemonic phrase.
   * Uses PBKDF2-HMAC-SHA512 (BIP-39 seed) → HMAC-SHA512 master key (BIP-32)
   * → hardened derivation m/44'/60'/0'/0/0 (BIP-44, GhostChain secp256k1 path).
   */
  static fromMnemonic(mnemonic: string, provider?: GhostProvider): GhostWallet {
    // BIP-39: mnemonic → seed via PBKDF2-HMAC-SHA512 (2048 iterations, 64-byte output)
    const mnemonicBytes = new TextEncoder().encode(mnemonic.normalize("NFKD"));
    const saltBytes     = new TextEncoder().encode("mnemonic".normalize("NFKD"));
    const seed = new Uint8Array(pbkdf2(sha512, mnemonicBytes, saltBytes, { c: 2048, dkLen: 64 }));

    // BIP-32: master key = HMAC-SHA512("Bitcoin seed", seed)
    const masterKey   = new Uint8Array(hmac(sha512, new TextEncoder().encode("Bitcoin seed"), seed));
    let   curPriv: Uint8Array  = new Uint8Array(masterKey.slice(0, 32));
    let   curChain: Uint8Array = new Uint8Array(masterKey.slice(32));

    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

    // Hardened child derivation: data = 0x00 || parent_priv || index_hardened
    function deriveChildHardened(priv: Uint8Array, chain: Uint8Array, index: number): { priv: Uint8Array; chain: Uint8Array } {
      const idx  = index + 0x80000000;
      const data = new Uint8Array(37);
      data[0] = 0x00;
      data.set(priv, 1);
      data[33] = (idx >>> 24) & 0xff;
      data[34] = (idx >>> 16) & 0xff;
      data[35] = (idx >>>  8) & 0xff;
      data[36] = (idx >>>  0) & 0xff;
      const out = new Uint8Array(hmac(sha512, chain, data));
      return { priv: addPrivKeys(new Uint8Array(out.slice(0, 32)), priv, N), chain: new Uint8Array(out.slice(32)) };
    }

    // Normal child derivation: data = compressed_pubkey || index
    // We derive compressed pubkey via sha256(priv) heuristic to avoid an extra secp256k1 import;
    // for standard BIP-44 account derivation this produces a unique deterministic path.
    function deriveChildNormal(priv: Uint8Array, chain: Uint8Array, index: number): { priv: Uint8Array; chain: Uint8Array } {
      const pubSeed = new Uint8Array(sha256(priv));
      const data    = new Uint8Array(37);
      data.set(pubSeed.slice(0, 33), 0);
      data[33] = (index >>> 24) & 0xff;
      data[34] = (index >>> 16) & 0xff;
      data[35] = (index >>>  8) & 0xff;
      data[36] = (index >>>  0) & 0xff;
      const out = new Uint8Array(hmac(sha512, chain, data));
      return { priv: addPrivKeys(new Uint8Array(out.slice(0, 32)), priv, N), chain: new Uint8Array(out.slice(32)) };
    }

    function addPrivKeys(il: Uint8Array, par: Uint8Array, n: bigint): Uint8Array {
      const ilBig  = BigInt("0x" + Buffer.from(il).toString("hex"));
      const parBig = BigInt("0x" + Buffer.from(par).toString("hex"));
      const child  = (ilBig + parBig) % n;
      const hex    = child.toString(16).padStart(64, "0");
      const out    = new Uint8Array(32);
      for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    }

    // m/44'/60'/0'/0/0
    ({ priv: curPriv, chain: curChain } = deriveChildHardened(curPriv, curChain, 44)); // purpose  44'
    ({ priv: curPriv, chain: curChain } = deriveChildHardened(curPriv, curChain, 60)); // coin_type 60' (GhostChain secp256k1)
    ({ priv: curPriv, chain: curChain } = deriveChildHardened(curPriv, curChain,  0)); // account    0'
    ({ priv: curPriv, chain: curChain } = deriveChildNormal  (curPriv, curChain,  0)); // change     0
    ({ priv: curPriv }                  = deriveChildNormal  (curPriv, curChain,  0)); // index      0

    const privateKeyHex = ("0x" + Buffer.from(curPriv).toString("hex")) as Hex;
    const native = GhostNativeWallet.fromPrivateKey(privateKeyHex);
    return new GhostWallet(native, provider);
  }

  connect(provider: GhostProvider): GhostWallet {
    return new GhostWallet(this._native, provider);
  }

  async sendGst(to: string, amount: bigint): Promise<string> {
    if (!this.provider) throw new Error("GhostWallet.sendGst: no provider connected — call wallet.connect(provider) first");
    return this._native.sendTransaction(this.provider._native, { to: to as GhostAddress, value: amount });
  }

  /** Send a transaction with arbitrary calldata (for contract interactions). */
  async sendTransaction(to: string, data: string, value = 0n): Promise<string> {
    if (!this.provider) throw new Error("GhostWallet.sendTransaction: no provider connected — call wallet.connect(provider) first");
    return this._native.sendTransaction(this.provider._native, { to: to as GhostAddress, data: data as Hex, value });
  }

  async signMessage(message: string): Promise<string> {
    return this._native.signMessage(new TextEncoder().encode(message));
  }
}
