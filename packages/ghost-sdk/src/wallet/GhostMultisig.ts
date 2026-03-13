/**
 * GhostMultisig — off-chain multi-signature wallet coordinator.
 *
 * Collects secp256k1 owner signatures off-chain and submits the final
 * signed payload once the quorum threshold is met.  On-chain execution
 * is via an existing GhostMultisigVault contract (separate deploy); this
 * class is the client-side coordinator only.
 *
 * Designed for:
 *   - SovereignTreasury governance transactions
 *   - Validator quorum proposals
 *   - GhostXchange administrative operations
 *
 * Usage:
 *   const ms = new GhostMultisig({
 *     owners: ["0xAlice", "0xBob", "0xCarol"],
 *     threshold: 2,
 *   });
 *
 *   const digest = ms.computeDigest(tx, nonce);
 *   ms.addSignature("0xAlice", await walletAlice.signHash(digest));
 *   ms.addSignature("0xBob",   await walletBob.signHash(digest));
 *
 *   if (ms.hasQuorum()) {
 *     const payload = ms.buildPayload(tx, nonce);
 *     await vaultContract.execute(payload);
 *   }
 */

import type { GhostAddress, Hex, GhostTxRequest } from "../native/types.js";
import { keccak256, toUtf8Bytes, hexlify, concat } from "ethers";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GhostMultisigConfig {
  /** Ordered list of owner addresses (case-insensitive match). */
  owners: GhostAddress[];
  /** Minimum signatures required to reach quorum. */
  threshold: number;
}

export interface MultisigPayload {
  tx: GhostTxRequest;
  nonce: number;
  signatures: Array<{ owner: GhostAddress; sig: Hex }>;
}

// ── GhostMultisig ─────────────────────────────────────────────────────────────

export class GhostMultisig {
  readonly owners: ReadonlyArray<GhostAddress>;
  readonly threshold: number;

  private readonly _signatures = new Map<string, Hex>();

  constructor(config: GhostMultisigConfig) {
    if (config.threshold < 1) {
      throw new Error("GhostMultisig: threshold must be >= 1");
    }
    if (config.threshold > config.owners.length) {
      throw new Error(
        `GhostMultisig: threshold (${config.threshold}) exceeds owner count (${config.owners.length})`,
      );
    }
    this.owners    = config.owners.map(a => a.toLowerCase() as GhostAddress);
    this.threshold = config.threshold;
  }

  // ── Digest ──────────────────────────────────────────────────────────────────

  /**
   * Compute the 32-byte signing digest for the given transaction + nonce.
   *
   * GhostChain multisig domain prefix: "\x19GhostChain Multisig:\n"
   * digest = keccak256(domainPrefix + keccak256(ABI-packed(tx.to, tx.value, tx.data, nonce)))
   */
  computeDigest(tx: GhostTxRequest, nonce: number): Hex {
    const inner = keccak256(
      hexlify(
        concat([
          toUtf8Bytes(tx.to ?? ""),
          _encodeBigint(tx.value ?? 0n),
          tx.data ? tx.data : "0x",
          _encodeUint32(nonce),
        ]),
      ),
    );
    const prefixed = concat([
      toUtf8Bytes("\x19GhostChain Multisig:\n32"),
      inner,
    ]);
    return keccak256(hexlify(prefixed)) as Hex;
  }

  // ── Signature collection ────────────────────────────────────────────────────

  /**
   * Record a signature from `owner`.
   * @throws if `owner` is not in the owners list.
   */
  addSignature(owner: GhostAddress, sig: Hex): void {
    const key = owner.toLowerCase();
    if (!this.owners.includes(key as GhostAddress)) {
      throw new Error(`GhostMultisig: address ${owner} is not an owner`);
    }
    this._signatures.set(key, sig);
  }

  /** Remove a previously added signature. */
  removeSignature(owner: GhostAddress): void {
    this._signatures.delete(owner.toLowerCase());
  }

  /** Return the number of collected signatures. */
  signatureCount(): number {
    return this._signatures.size;
  }

  /** True when enough signatures have been collected. */
  hasQuorum(): boolean {
    return this._signatures.size >= this.threshold;
  }

  /** Return all collected { owner, sig } pairs in owner-list order. */
  collectedSignatures(): Array<{ owner: GhostAddress; sig: Hex }> {
    return this.owners
      .filter(o => this._signatures.has(o))
      .map(o => ({ owner: o, sig: this._signatures.get(o)! }));
  }

  /** Return owners who have NOT yet signed. */
  pendingOwners(): GhostAddress[] {
    return this.owners.filter(o => !this._signatures.has(o));
  }

  // ── Payload assembly ────────────────────────────────────────────────────────

  /**
   * Assemble the final payload for on-chain submission.
   * @throws if quorum has not been reached.
   */
  buildPayload(tx: GhostTxRequest, nonce: number): MultisigPayload {
    if (!this.hasQuorum()) {
      throw new Error(
        `GhostMultisig: quorum not met — have ${this._signatures.size} / ${this.threshold} signatures`,
      );
    }
    return {
      tx,
      nonce,
      signatures: this.collectedSignatures(),
    };
  }

  /** Reset all collected signatures. */
  reset(): void {
    this._signatures.clear();
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _encodeBigint(value: bigint): Uint8Array {
  // Encode as 32-byte big-endian unsigned integer.
  const hex = value.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function _encodeUint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = (value >>> 24) & 0xff;
  bytes[1] = (value >>> 16) & 0xff;
  bytes[2] = (value >>>  8) & 0xff;
  bytes[3] =  value         & 0xff;
  return bytes;
}
