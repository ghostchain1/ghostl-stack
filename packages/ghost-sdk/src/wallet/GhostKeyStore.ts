/**
 * GhostKeyStore
 *
 * AES-256-GCM encrypted key storage for GhostStack.
 *
 * Stores encrypted private keys in an in-memory map, with optional
 * serialisation to / deserialisation from a portable JSON blob (for
 * persisting to disk or a secrets manager).
 *
 * WARNING: This module is for server-side key management only.
 * Do NOT use it to store keys in browser localStorage or client bundles.
 *
 * Usage:
 *   const ks = new GhostKeyStore("my-strong-password");
 *   await ks.add("deployer", "0xdeadbeef...");
 *   const key = await ks.get("deployer");   // "0xdeadbeef..."
 *   const json = ks.export();               // save to disk
 *
 *   const ks2 = GhostKeyStore.fromJSON(json, "my-strong-password");
 *   const key2 = await ks2.get("deployer"); // same key
 */

// Node.js crypto — only available in server environments
// Throws at runtime (not import time) if called in browser
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALG     = "aes-256-gcm";
const SALT_LEN = 32;
const IV_LEN   = 12;
const TAG_LEN  = 16;
const KEY_LEN  = 32;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KeyStoreEntry {
  /** Key alias (e.g. "deployer", "operator") */
  alias: string;
  /** Encrypted key data (hex) */
  ciphertext: string;
  /** GCM auth tag (hex) */
  tag: string;
  /** IV (hex) */
  iv: string;
  /** KDF salt (hex) */
  salt: string;
}

export interface KeyStoreJSON {
  version: 1;
  entries: KeyStoreEntry[];
}

// ── GhostKeyStore ──────────────────────────────────────────────────────────────

export class GhostKeyStore {
  private _password: string;
  private _entries:  Map<string, KeyStoreEntry> = new Map();

  constructor(password: string) {
    if (!password) throw new Error("GhostKeyStore: password must not be empty");
    this._password = password;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * Encrypt and store a private key under the given alias.
   * Overwrites any existing entry with the same alias.
   */
  add(alias: string, privateKey: string): void {
    const salt   = randomBytes(SALT_LEN);
    const iv     = randomBytes(IV_LEN);
    const dk     = this._deriveKey(salt);
    const cipher = createCipheriv(ALG, dk, iv);
    const plain  = Buffer.from(privateKey.replace(/^0x/, ""), "hex");
    const ct     = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag    = cipher.getAuthTag();

    this._entries.set(alias, {
      alias,
      ciphertext: ct.toString("hex"),
      tag:        tag.toString("hex"),
      iv:         iv.toString("hex"),
      salt:       salt.toString("hex"),
    });
  }

  /**
   * Decrypt and return the private key for the given alias.
   * Returns null if the alias does not exist.
   * Throws if decryption fails (wrong password / corrupted data).
   */
  get(alias: string): string | null {
    const entry = this._entries.get(alias);
    if (!entry) return null;

    const salt    = Buffer.from(entry.salt, "hex");
    const iv      = Buffer.from(entry.iv, "hex");
    const ct      = Buffer.from(entry.ciphertext, "hex");
    const tag     = Buffer.from(entry.tag, "hex");
    const dk      = this._deriveKey(salt);
    const decipher = createDecipheriv(ALG, dk, iv);
    decipher.setAuthTag(tag);

    try {
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      return "0x" + plain.toString("hex");
    } catch {
      throw new Error(`GhostKeyStore: failed to decrypt entry "${alias}" — wrong password?`);
    }
  }

  /** Remove a key by alias. Returns true if removed. */
  remove(alias: string): boolean {
    return this._entries.delete(alias);
  }

  /** List all stored key aliases. */
  aliases(): string[] {
    return [...this._entries.keys()];
  }

  /** True if an entry exists for the alias. */
  has(alias: string): boolean {
    return this._entries.has(alias);
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  /** Export as a portable JSON blob. The keys remain encrypted. */
  export(): KeyStoreJSON {
    return { version: 1, entries: [...this._entries.values()] };
  }

  /** Load from a previously exported JSON blob. */
  static fromJSON(json: KeyStoreJSON | string, password: string): GhostKeyStore {
    const data: KeyStoreJSON = typeof json === "string" ? JSON.parse(json) as KeyStoreJSON : json;
    if (data.version !== 1) throw new Error("GhostKeyStore: unsupported keystore version");
    const ks = new GhostKeyStore(password);
    for (const entry of data.entries) {
      ks._entries.set(entry.alias, entry);
    }
    return ks;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _deriveKey(salt: Buffer): Buffer {
    return scryptSync(this._password, salt, KEY_LEN, { N: 16384, r: 8, p: 1 }) as Buffer;
  }
}
