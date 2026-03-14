// ─────────────────────────────────────────────────────────────────────────────
// GhostWallet – Real secp256k1 signing + GhostChain address derivation
//
//  Address:
//    uncompressed pubkey (64 raw bytes) → keccak256 → last 20 bytes → EIP-55
//
//  EIP-1559 signing:
//    hash  = keccak256(0x02 || rlp(unsigned))  [via tx.signingHash()]
//    sig   = secp256k1.signAsync(hash, key, { lowS: true })
//    v     = sig.recovery  (0 or 1)
//    r, s  = 32-byte big-endian components
//    rawTx = 0x02 || rlp([...fields, v, r, s])
//
//  EIP-191 signing:
//    digest = keccak256("\x19GhostChain Signed Message:\n" + len + message)
//    65-byte result: r(32) || s(32) || (v + 27)
// ─────────────────────────────────────────────────────────────────────────────

import * as secp from "@noble/secp256k1";
import { keccak256 } from "../crypto/keccak";
import { GhostTransaction } from "../tx/GhostTransaction";
import { GhostWalletError } from "../errors";
import { checksumAddress } from "../utils/address";

export class GhostWallet {
  private readonly _privateKey: Uint8Array;

  constructor(privateKey: string) {
    const cleaned = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
    if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
      throw new GhostWalletError("Invalid private key: must be 32 bytes (64 hex chars)");
    }
    this._privateKey = Uint8Array.from(Buffer.from(cleaned, "hex"));
    if (!secp.utils.isValidPrivateKey(this._privateKey)) {
      throw new GhostWalletError("Private key is not a valid secp256k1 scalar");
    }
  }

  // ─── Address derivation ──────────────────────────────────────────────────

  /**
   * Real GhostChain address:
   *   secp256k1.getPublicKey(privKey, false)  →  65 bytes (0x04 + 64 raw)
   *   drop prefix byte                         →  64 bytes
   *   keccak256(64 bytes)                      →  32 bytes
   *   last 20 bytes                            →  address
   *   EIP-55 checksum                          →  final address
   */
  get address(): string {
    const uncompressed = secp.getPublicKey(this._privateKey, false); // 65 bytes
    const pubkeyBody   = uncompressed.slice(1);                       // 64 raw bytes
    const hash         = keccak256(pubkeyBody);                       // 32 bytes
    const raw          = "0x" + Buffer.from(hash.slice(12)).toString("hex");
    return checksumAddress(raw);
  }

  /** 65-byte uncompressed public key as 0x hex. */
  get publicKey(): string {
    return "0x" + Buffer.from(secp.getPublicKey(this._privateKey, false)).toString("hex");
  }

  /** 33-byte compressed public key as 0x hex. */
  get publicKeyCompressed(): string {
    return "0x" + Buffer.from(secp.getPublicKey(this._privateKey, true)).toString("hex");
  }

  // ─── EIP-1559 transaction signing ────────────────────────────────────────

  /**
   * Signs an EIP-1559 (type 2) transaction.
   * Returns the 0x-prefixed raw transaction hex ready for eth_sendRawTransaction.
   */
  async signTransaction(tx: GhostTransaction): Promise<string> {
    const hash = tx.signingHash();                                    // keccak256(0x02||rlp(unsigned))
    const sig  = await secp.signAsync(hash, this._privateKey, { lowS: true });
    const v    = sig.recovery!;                                       // 0 or 1 (EIP-1559, not 27/28)
    const r    = _bigintTo32Bytes(sig.r);
    const s    = _bigintTo32Bytes(sig.s);
    return tx.encodeSigned(v, r, s);
  }

  // ─── EIP-191 message signing ─────────────────────────────────────────────

  /**
   * Signs a plain message per EIP-191.
   * Returns 65-byte hex: r(32) || s(32) || v(1) where v ∈ {27, 28}.
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    const bytes  = typeof message === "string" ? new TextEncoder().encode(message) : message;
    const prefix = new TextEncoder().encode(`\x19GhostChain Signed Message:\n${bytes.length}`);
    const hash   = keccak256(new Uint8Array([...prefix, ...bytes]));
    const sig    = await secp.signAsync(hash, this._privateKey, { lowS: true });
    const r      = _bigintTo32Bytes(sig.r);
    const s      = _bigintTo32Bytes(sig.s);
    const v      = sig.recovery! + 27;                                // 27 or 28
    return "0x" + Buffer.from(new Uint8Array([...r, ...s, v])).toString("hex");
  }

  // ─── Public key / address recovery ───────────────────────────────────────

  /** Recover the signer address from a 65-byte EIP-191 signature + original message. */
  static recoverSigner(message: string | Uint8Array, signatureHex: string): string {
    const bytes    = typeof message === "string" ? new TextEncoder().encode(message) : message;
    const prefix   = new TextEncoder().encode(`\x19GhostChain Signed Message:\n${bytes.length}`);
    const hash     = keccak256(new Uint8Array([...prefix, ...bytes]));
    const sigBytes = Uint8Array.from(Buffer.from(signatureHex.replace("0x", ""), "hex"));
    if (sigBytes.length !== 65) throw new GhostWalletError("Signature must be 65 bytes");
    const r        = _bytesToBigint(sigBytes.slice(0, 32));
    const s        = _bytesToBigint(sigBytes.slice(32, 64));
    const recovery = sigBytes[64] >= 27 ? sigBytes[64] - 27 : sigBytes[64];
    const pubkey   = new secp.Signature(r, s).addRecoveryBit(recovery).recoverPublicKey(hash);
    const hashed   = keccak256(pubkey.toRawBytes(false).slice(1));
    return checksumAddress("0x" + Buffer.from(hashed.slice(12)).toString("hex"));
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static generateRandom(): GhostWallet {
    return new GhostWallet("0x" + Buffer.from(secp.utils.randomPrivateKey()).toString("hex"));
  }

  /** Export private key as 0x hex – keep secret! */
  exportPrivateKey(): string {
    return "0x" + Buffer.from(this._privateKey).toString("hex");
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _bigintTo32Bytes(n: bigint): Uint8Array {
  return Uint8Array.from(Buffer.from(n.toString(16).padStart(64, "0"), "hex"));
}

function _bytesToBigint(bytes: Uint8Array): bigint {
  return BigInt("0x" + Buffer.from(bytes).toString("hex"));
}
