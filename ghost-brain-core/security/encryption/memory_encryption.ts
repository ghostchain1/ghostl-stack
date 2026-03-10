/**
 * GhostBrain — Memory Encryption Layer (TypeScript)
 *
 * Provides transparent AES-256-XTS encryption for tensor data at rest
 * in the GhostBrain SRAM / HBM scratch area. This is the host-side
 * key-management shim; the actual per-sector encryption is performed
 * in hardware via the chiplet's Memory Encryption Engine (MEE).
 *
 * Key hierarchy:
 *   Root secret (eFuse) → HKDF → Sector KEK → XTS tweak keys
 *
 * XTS-AES-256 is the standard (IEEE 1619 / NIST SP 800-38E) for
 * storage at the sector level. Sector size = 4 KB (one SRAM page).
 *
 * SECURITY:
 *   - Key material is never stored in plain text to disk or logs.
 *   - Keys are fetched from HashiCorp Vault; see key_manager.ts.
 *   - Only the chip's attestation authority can unseal keys for a device.
 */

import { webcrypto } from "node:crypto";
import type { Hex } from "../../runtime/scheduler/types.js";

// ── Constants ──────────────────────────────────────────────────────────────

/** AES-256-XTS key size: two 256-bit (32-byte) keys = 64 bytes total. */
const XTS_KEY_BYTES = 64;

/** Sector size (must align with SRAM page size = 4 KB). */
const SECTOR_SIZE_BYTES = 4096;

/** Maximum plaintext per call (one sector). */
const MAX_DATA_BYTES = SECTOR_SIZE_BYTES;

// ── Types ──────────────────────────────────────────────────────────────────

/** XTS sector index (0-based, u64). */
export type SectorIndex = bigint;

/** Encrypted sector blob: IV (16 bytes LE sector number) + ciphertext. */
export interface EncryptedSector {
  sectorIndex: SectorIndex;
  ciphertext:  ArrayBuffer;
}

// ── AES-256-XTS (host simulation via WebCrypto CTR fallback) ──────────────
//
// NOTE: WebCrypto does not expose XTS mode natively. In production, the
// chiplet's hardware MEE handles XTS transparently. The host-side code
// only manages KEY MATERIAL, not the actual sector encryption.
//
// For unit testing and FPGA-proxy simulation, we use AES-256-CTR as an
// approximation (same security level, non-XTS tweak). Mark all simulation
// code with /* SIMULATION ONLY */ so auditors can identify it.

/** Import a 256-bit AES key for simulation purposes (SIMULATION ONLY). */
async function importSimKey(keyBytes: Uint8Array): Promise<CryptoKey> /* SIMULATION ONLY */ {
  return webcrypto.subtle.importKey(
    "raw",
    keyBytes.slice(0, 32).buffer as ArrayBuffer,
    { name: "AES-CTR" },
    false,
    ["encrypt", "decrypt"],
  ) as unknown as CryptoKey;
}

/** Build a 16-byte AES-CTR IV from a sector index (little-endian 64-bit). */
function sectorIv(sectorIndex: SectorIndex): ArrayBuffer {
  const buf = new Uint8Array(16);
  let v     = sectorIndex;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return buf.buffer;
}

// ── MemoryEncryption ────────────────────────────────────────────────────────

export class MemoryEncryption {
  #xtsKey: Uint8Array;         // 64 bytes: [key1(32)] + [key2(32)]
  #simKey: CryptoKey | null = null;

  private constructor(xtsKey: Uint8Array) {
    if (xtsKey.byteLength !== XTS_KEY_BYTES) {
      throw new RangeError(`XTS key must be ${XTS_KEY_BYTES} bytes`);
    }
    this.#xtsKey = xtsKey;
  }

  /** Factory: import a raw 64-byte XTS key. */
  static async create(rawXtsKey: Uint8Array): Promise<MemoryEncryption> {
    const enc = new MemoryEncryption(rawXtsKey);
    enc.#simKey = await importSimKey(rawXtsKey);
    return enc;
  }

  /**
   * Encrypt one sector of plaintext (≤ SECTOR_SIZE_BYTES).
   * Host simulation only — on real hardware the MEE handles this in HW.
   * (SIMULATION ONLY)
   */
  async encryptSector(
    plaintext:   ArrayBuffer,
    sectorIndex: SectorIndex,
  ): Promise<EncryptedSector> /* SIMULATION ONLY */ {
    if (plaintext.byteLength > MAX_DATA_BYTES) {
      throw new RangeError(`Plaintext exceeds max sector size (${MAX_DATA_BYTES} bytes)`);
    }
    if (!this.#simKey) throw new Error("Key not initialised");

    const iv         = sectorIv(sectorIndex);
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-CTR", counter: iv, length: 64 },
      this.#simKey,
      plaintext,
    );
    return { sectorIndex, ciphertext };
  }

  /**
   * Decrypt one sector of ciphertext (≤ SECTOR_SIZE_BYTES).
   * (SIMULATION ONLY)
   */
  async decryptSector(
    encrypted: EncryptedSector,
  ): Promise<ArrayBuffer> /* SIMULATION ONLY */ {
    if (!this.#simKey) throw new Error("Key not initialised");

    const iv = sectorIv(encrypted.sectorIndex);
    return webcrypto.subtle.decrypt(
      { name: "AES-CTR", counter: iv, length: 64 },
      this.#simKey,
      encrypted.ciphertext,
    );
  }

  /** Securely zeroise the key material from memory. */
  zeroise(): void {
    this.#xtsKey.fill(0);
    this.#simKey = null;
  }
}

// ── Sector Key Derivation ──────────────────────────────────────────────────

/**
 * Derive a sector-level XTS key from a base KEK (Key Encryption Key)
 * and a tenant/device identifier using HKDF-SHA-256.
 *
 * Inputs:
 *   kek       — 32-byte base key (from Vault)
 *   identity  — UTF-8 chip UUID or tenant ID
 *   purpose   — context label ("sram-xts" | "hbm-xts")
 *
 * Output: 64-byte XTS key pair [key1 ‖ key2]
 */
export async function deriveXtsKey(
  kek:      ArrayBuffer,
  identity: string,
  purpose:  "sram-xts" | "hbm-xts",
): Promise<Uint8Array> {
  const baseKey = await webcrypto.subtle.importKey(
    "raw", kek,
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );

  const encoder = new TextEncoder();
  const info    = encoder.encode(`ghostbrain/${purpose}/${identity}`);
  const salt    = encoder.encode("ghostbrain-memory-encryption-v1");

  const bits = await webcrypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    XTS_KEY_BYTES * 8,  // 512 bits = 64 bytes
  );
  return new Uint8Array(bits);
}

// ── Convenience: encrypt/decrypt a tensor buffer ──────────────────────────

/**
 * Encrypt a tensor buffer, splitting into aligned 4 KB sectors.
 * Returns an array of encrypted sectors.
 * (SIMULATION ONLY — on real hardware MEE handles this transparently)
 */
export async function encryptTensorBuffer(
  enc:       MemoryEncryption,
  buffer:    ArrayBuffer,
  baseIndex: SectorIndex = 0n,
): Promise<EncryptedSector[]> /* SIMULATION ONLY */ {
  const sectors: EncryptedSector[] = [];
  let offset = 0;
  let i      = 0n;

  while (offset < buffer.byteLength) {
    const chunk = buffer.slice(offset, offset + SECTOR_SIZE_BYTES);
    sectors.push(await enc.encryptSector(chunk, baseIndex + i));
    offset += SECTOR_SIZE_BYTES;
    i++;
  }
  return sectors;
}

/**
 * Decrypt and reassemble a tensor buffer from encrypted sectors.
 * (SIMULATION ONLY)
 */
export async function decryptTensorBuffer(
  enc:     MemoryEncryption,
  sectors: EncryptedSector[],
): Promise<ArrayBuffer> /* SIMULATION ONLY */ {
  const parts = await Promise.all(sectors.map(s => enc.decryptSector(s)));
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), offset);
    offset += p.byteLength;
  }
  return out.buffer;
}
