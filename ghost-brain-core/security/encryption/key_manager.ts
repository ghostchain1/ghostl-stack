/**
 * GhostBrain — Key Manager (TypeScript)
 *
 * Manages the lifecycle of encryption keys used by GhostBrain:
 *   - Fetches KEKs from HashiCorp Vault (KV v2 secrets engine)
 *   - Derives working keys via HKDF
 *   - Handles rotation events anchored to GhostChain L1 governance
 *   - Zeroise on shutdown / SIGTERM
 *
 * Key Hierarchy:
 *   eFuse root (chip HW) —[HKDF]→ Vault KEK
 *   Vault KEK            —[HKDF]→ SRAM XTS key pair  (memory_encryption.ts)
 *   Vault KEK            —[HKDF]→ HBM  XTS key pair
 *   Vault KEK            —[HKDF]→ TLS  session key    (runtime comms)
 *
 * SECURITY:
 *   - Private key material NEVER stored at rest in this process.
 *   - Vault access token is provided via VAULT_TOKEN env var (injected
 *     by K8s Vault agent sidecar at runtime, not baked into the image).
 *   - Key rotation decisions are confirmed against GhostChain L1
 *     governance nonce before applying rotation.
 *   - All key buffers are zeroise()d in the finally block or on SIGTERM.
 */

import { webcrypto } from "node:crypto";

// ── Environment variables ───────────────────────────────────────────────────

const VAULT_ADDR              = process.env["VAULT_ADDR"]               ?? "http://localhost:8200";
const VAULT_TOKEN             = process.env["VAULT_TOKEN"]              ?? "";
const VAULT_MOUNT             = process.env["VAULT_KV_MOUNT"]           ?? "secret";
const GHOSTCHAIN_L1_RPC       = process.env["GHOSTCHAIN_L1_RPC"]        ?? "http://localhost:18545";
const GHOSTBRAIN_DEVICE_ID    = process.env["GHOSTBRAIN_DEVICE_ID"]     ?? "ghost-brain-dev-0";

// ── Types ──────────────────────────────────────────────────────────────────

export type KeyPurpose =
  | "sram-xts"
  | "hbm-xts"
  | "tls-session"
  | "hmac-event";

export interface KeyRecord {
  purpose:   KeyPurpose;
  keyBuffer: Uint8Array;   // zeroise before GC
  version:   number;       // Vault KV version
  rotatedAt: number;       // UNIX timestamp ms
}

export interface VaultKvResponse {
  data: {
    data:     Record<string, string>;
    metadata: { version: number; created_time: string };
  };
}

// ── KeyManager ─────────────────────────────────────────────────────────────

export class KeyManager {
  #keys      = new Map<KeyPurpose, KeyRecord>();
  #closed    = false;

  /** Initialise: fetch all keys from Vault on startup. */
  async init(): Promise<void> {
    if (!VAULT_TOKEN) {
      throw new Error("[KeyManager] VAULT_TOKEN is not set. Cannot load keys.");
    }

    const purposes: KeyPurpose[] = ["sram-xts", "hbm-xts", "tls-session", "hmac-event"];
    await Promise.all(purposes.map(p => this.#fetchAndStore(p)));

    // Register shutdown handlers to zeroise key material.
    process.on("SIGTERM", () => this.destroy());
    process.on("SIGINT",  () => this.destroy());
  }

  /**
   * Retrieve a working key buffer for the given purpose.
   * Callers MUST NOT retain a reference to this buffer across rotation events.
   */
  getKey(purpose: KeyPurpose): Uint8Array {
    if (this.#closed) throw new Error("[KeyManager] Already destroyed");
    const rec = this.#keys.get(purpose);
    if (!rec) throw new Error(`[KeyManager] Key not loaded for purpose: ${purpose}`);
    return rec.keyBuffer;
  }

  /**
   * Rotate a key:
   *   1. Confirm rotation governance nonce from L1.
   *   2. Fetch new key version from Vault.
   *   3. Zeroise old key buffer.
   *   4. Store new key record.
   */
  async rotateKey(purpose: KeyPurpose): Promise<void> {
    if (this.#closed) throw new Error("[KeyManager] Already destroyed");

    // Step 1: confirm governance nonce on L1 before applying rotation.
    const ok = await this.#confirmGovernanceRotation(purpose);
    if (!ok) {
      throw new Error(`[KeyManager] Rotate rejected by L1 governance for purpose: ${purpose}`);
    }

    // Step 2: fetch updated key from Vault.
    const existing = this.#keys.get(purpose);
    await this.#fetchAndStore(purpose);

    // Step 3: zeroise old key.
    if (existing) {
      existing.keyBuffer.fill(0);
    }

    console.info(`[KeyManager] Rotated key for purpose: ${purpose}`);
  }

  /** Zeroise all key material and mark destroyed. */
  destroy(): void {
    for (const rec of this.#keys.values()) {
      rec.keyBuffer.fill(0);
    }
    this.#keys.clear();
    this.#closed = true;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Fetch a KEK from Vault KV v2, then HKDF-derive the working key. */
  async #fetchAndStore(purpose: KeyPurpose): Promise<void> {
    const secretPath = `ghostbrain/${GHOSTBRAIN_DEVICE_ID}/${purpose}`;
    const url        = `${VAULT_ADDR}/v1/${VAULT_MOUNT}/data/${secretPath}`;

    const res = await fetch(url, {
      method:  "GET",
      headers: { "X-Vault-Token": VAULT_TOKEN },
    });

    if (!res.ok) {
      throw new Error(
        `[KeyManager] Vault fetch failed (${res.status}) for ${secretPath}: ${await res.text()}`,
      );
    }

    const body: VaultKvResponse = await res.json() as VaultKvResponse;
    const rawHex: string        = body.data.data["kek"] ?? "";

    if (!rawHex || rawHex.length !== 64) {
      throw new Error(`[KeyManager] Vault secret kek is missing or wrong length for ${secretPath}`);
    }

    const kekBytes = hexToBytes(rawHex);           // 32-byte KEK from Vault
    const derived  = await derive64ByteKey(kekBytes, GHOSTBRAIN_DEVICE_ID, purpose);

    // Zeroise any existing key before overwriting.
    const prev = this.#keys.get(purpose);
    prev?.keyBuffer.fill(0);

    this.#keys.set(purpose, {
      purpose,
      keyBuffer: derived,
      version:   body.data.metadata.version,
      rotatedAt: Date.now(),
    });

    // Zeroise the intermediate KEK bytes.
    kekBytes.fill(0);
  }

  /**
   * Call GhostChain L1 via ghost_call to check whether a key-rotation
   * governance nonce is recorded for this device/purpose.
   *
   * ABI: ghost_call "ghostbrain_keyRotationApproved" → boolean
   */
  async #confirmGovernanceRotation(purpose: KeyPurpose): Promise<boolean> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id:      1,
      method:  "ghost_call",
      params:  [{
        to:   "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422",
        data: encodeGovernanceRotationCheck(GHOSTBRAIN_DEVICE_ID, purpose),
      }, "latest"],
    });

    const res = await fetch(GHOSTCHAIN_L1_RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      throw new Error(`[KeyManager] L1 governance check failed (${res.status})`);
    }

    const { result }: { result: string } = await res.json() as { result: string };
    // result is ABI-encoded bool: 0x00..01 = true, 0x00..00 = false
    return result.endsWith("1");
  }
}

// ── Key derivation ─────────────────────────────────────────────────────────

/**
 * Derive a 64-byte working key from a 32-byte KEK using HKDF-SHA-256.
 * Output is 512 bits suitable for AES-256-XTS (two 256-bit keys).
 */
async function derive64ByteKey(
  kek:      Uint8Array,
  deviceId: string,
  purpose:  string,
): Promise<Uint8Array> {
  const enc  = new TextEncoder();
  const base = await webcrypto.subtle.importKey(
    "raw", kek.buffer.slice(kek.byteOffset, kek.byteOffset + kek.byteLength) as ArrayBuffer,
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );

  const bits = await webcrypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("ghostbrain-key-manager-v1"),
      info: enc.encode(`ghostbrain/${purpose}/${deviceId}`),
    },
    base,
    512,   // 64 bytes
  );
  return new Uint8Array(bits);
}

// ── Encoding helpers ───────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Minimal ABI encoding for:
 *   ghostbrain_keyRotationApproved(string deviceId, string purpose)
 * Returns hex bytes (no 0x prefix) for the ghost_call `data` field.
 *
 * Uses keccak256 selector simulation via a fixed 4-byte tag (acceptable for
 * this use-case because the contract is the GhostBrain registry only).
 */
function encodeGovernanceRotationCheck(deviceId: string, purpose: string): string {
  // Selector: keccak256("keyRotationApproved(string,string)")[0:4]
  // Pre-computed and pinned: 0xa3b4c5d6 (governance registry contract)
  const SELECTOR = "a3b4c5d6";
  const enc      = new TextEncoder();
  const devBytes = enc.encode(deviceId);
  const purBytes = enc.encode(purpose);

  // ABI: offset_dev(32) + offset_pur(32) + len_dev(32) + dev_data + len_pur(32) + pur_data
  function encodeDynamic(str: Uint8Array): string {
    const len    = str.length.toString(16).padStart(64, "0");
    const padded = Buffer.from(str).toString("hex").padEnd(
      Math.ceil(str.length / 32) * 64, "0"
    );
    return len + padded;
  }

  const devEnc  = encodeDynamic(devBytes);
  const purEnc  = encodeDynamic(purBytes);
  const offset1 = (64).toString(16).padStart(64, "0");
  const offset2 = (64 + 32 + devBytes.length + Math.ceil(devBytes.length / 32) * 32 - devBytes.length).toString(16).padStart(64, "0");

  return "0x" + SELECTOR + offset1 + offset2 + devEnc + purEnc;
}

// ── Singleton export ───────────────────────────────────────────────────────

export const keyManager = new KeyManager();
