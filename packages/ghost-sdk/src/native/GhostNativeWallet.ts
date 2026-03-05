// Uses @noble/curves (available in root node_modules) — no ethers dependency.
import { secp256k1 } from "@noble/curves/secp256k1";
import type { GhostAddress, GhostTxRequest, Hex, GhostWalletOptions } from "./types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { hexToBytes, bytesToHex } from "./bytes.js";
import { keccak256Bytes } from "./keccak.js";
import { add0x, strip0x } from "./hex.js";
import { toChecksumAddress } from "./address.js";
import { GhostTransaction } from "./GhostTransaction.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";

function leftPad32(b: Uint8Array): Uint8Array {
  if (b.length === 32) return b;
  if (b.length > 32) throw new GhostValidationError("Signature component too long");
  const out = new Uint8Array(32);
  out.set(b, 32 - b.length);
  return out;
}

/**
 * GhostNativeWallet — pure TypeScript wallet, no ethers.js dependency.
 *
 * Derives address from private key using secp256k1 and keccak256.
 * Signs EIP-1559 transactions natively.
 *
 * ```ts
 * const wallet = new GhostNativeWallet("0xprivkey", { chainId: 901 });
 * const hash = await wallet.sendTransaction(provider, { to: "0xabc...", value: 1n });
 * ```
 */
export class GhostNativeWallet {
  private readonly priv: Uint8Array;
  public readonly address: GhostAddress;
  public readonly chainId?: number;

  constructor(privateKey: Hex, opts: GhostWalletOptions = {}) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new GhostValidationError("Private key must be 32-byte hex string");
    }
    this.priv = hexToBytes(privateKey);
    this.chainId = opts.chainId;

    // Derive address: pubkey → keccak256 → last 20 bytes
    const pub = secp256k1.getPublicKey(this.priv, false); // uncompressed 65 bytes
    const pubHash = keccak256Bytes(pub.slice(1));          // drop 0x04 prefix
    this.address = toChecksumAddress(bytesToHex(pubHash.slice(12)) as GhostAddress);
  }

  static fromPrivateKey(privateKey: Hex, opts?: GhostWalletOptions): GhostNativeWallet {
    return new GhostNativeWallet(privateKey, opts);
  }

  /**
   * Sign arbitrary bytes with Ghost's personal-sign prefix.
   * Returns a 65-byte compact signature + recovery flag hex.
   */
  signMessage(message: Uint8Array): Hex {
    const prefix = new TextEncoder().encode(`\x19Ghost Signed Message:\n${message.length}`);
    const prefixed = new Uint8Array(prefix.length + message.length);
    prefixed.set(prefix, 0);
    prefixed.set(message, prefix.length);
    const digest = keccak256Bytes(prefixed);
    const sig = secp256k1.sign(digest, this.priv);
    const compact = sig.toCompactRawBytes();
    const out = new Uint8Array(65);
    out.set(compact, 0);
    out[64] = sig.recovery;
    return bytesToHex(out);
  }

  /** Sign an EIP-1559 transaction and return the raw signed hex. */
  signEip1559Tx(tx: GhostTxRequest): Hex {
    GhostTransaction.assertEip1559Ready(tx);
    const unsigned = GhostTransaction.serializeUnsigned(tx);
    const digest = keccak256Bytes(unsigned);
    const sig = secp256k1.sign(digest, this.priv);
    const compact = sig.toCompactRawBytes();
    return GhostTransaction.serializeSigned(tx, {
      yParity: sig.recovery as 0 | 1,
      r: leftPad32(compact.slice(0, 32)),
      s: leftPad32(compact.slice(32, 64)),
    });
  }

  /** Sign and broadcast a transaction. Returns the tx hash. */
  async sendTransaction(provider: GhostNativeProvider, tx: GhostTxRequest): Promise<Hex> {
    const chainId = tx.chainId ?? this.chainId ?? (await provider.getChainId());
    const nonce = tx.nonce ?? (await provider.getTransactionCount(this.address, "pending"));
    const fee = (tx.maxFeePerGas && tx.maxPriorityFeePerGas) ? null : await provider.getFeeSuggestion();
    const gasLimit = tx.gasLimit ?? (await provider.estimateGas({ ...tx, from: this.address }));

    const filled: GhostTxRequest = {
      ...tx,
      from: this.address,
      chainId,
      nonce,
      gasLimit,
      maxFeePerGas: tx.maxFeePerGas ?? fee?.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? fee?.maxPriorityFeePerGas,
    };
    return provider.sendRawTransaction(this.signEip1559Tx(filled));
  }
}
