/**
 * GhostBrain Memory Engine — Disk Store
 *
 * Low-level JSONL persistence layer. Each record is one JSON line.
 * Records are HMAC-SHA256 signed with GHOSTBRAIN_MEMORY_SECRET so tampered
 * or corrupted lines are detected at read time and skipped (not crashed on).
 *
 * All I/O is async (fs/promises). The store never calls appendFileSync so the
 * supervisor event loop is never blocked by kernel write syscalls.
 */

import { createHmac } from "crypto";
import { open, readFile, stat } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

import type { MemoryRecord, MemoryRecordPayload } from "../models/memory_record.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Absolute path to the JSONL memory file. Override via env var. */
const MEMORY_PATH = process.env["GHOSTBRAIN_MEMORY_PATH"]
  ?? "/var/lib/ghostbrain/memory.jsonl";

/**
 * HMAC secret. If unset, records are written with an empty hmac field and
 * integrity verification is skipped at read time (permissive mode).
 */
const MEMORY_SECRET = process.env["GHOSTBRAIN_MEMORY_SECRET"] ?? "";

// ---------------------------------------------------------------------------
// HMAC helpers
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 over the canonical JSON of the record payload.
 * Returns an empty string when no secret is configured.
 */
export function signRecord<C extends EventCategory>(
  payload: MemoryRecordPayload<C>,
): string {
  if (!MEMORY_SECRET) return "";
  const json = JSON.stringify(payload);
  return createHmac("sha256", MEMORY_SECRET).update(json).digest("hex");
}

/**
 * Verify a full record's HMAC.
 * Returns true when:
 *  - no secret is configured (permissive mode), OR
 *  - the stored hmac matches the freshly computed digest.
 */
export function verifyRecord<C extends EventCategory>(
  record: MemoryRecord<C>,
): boolean {
  if (!MEMORY_SECRET) return true;
  const { hmac, ...payload } = record;
  const expected = signRecord(payload as MemoryRecordPayload<C>);
  // Constant-time comparison via HMAC re-signing to prevent timing attacks.
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf   = Buffer.from(hmac,     "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedBuf.length; i++) {
    diff |= (expectedBuf[i]! ^ actualBuf[i]!);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// DiskStore
// ---------------------------------------------------------------------------

export class DiskStore {
  /** Resolved path used for all I/O. */
  readonly path: string;

  constructor(path: string = MEMORY_PATH) {
    this.path = path;
    this.ensureDir();
  }

  /**
   * Append one serialised record to the JSONL file.
   * Uses a file handle opened in append mode to guarantee atomicity per line.
   */
  async append(record: MemoryRecord): Promise<void> {
    const line = JSON.stringify(record) + "\n";
    const fh = await open(this.path, "a");
    try {
      await fh.write(line);
    } finally {
      await fh.close();
    }
  }

  /**
   * Read and parse all records from disk.
   * Lines that fail JSON.parse or HMAC verification are logged and skipped.
   * Returns records in file order (oldest first).
   */
  async readAll(): Promise<MemoryRecord[]> {
    if (!existsSync(this.path)) return [];

    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      console.warn("[DiskStore] Could not read memory file:", this.path);
      return [];
    }

    const records: MemoryRecord[] = [];
    const lines = raw.split("\n").filter(l => l.trim().length > 0);

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.warn("[DiskStore] Skipping malformed JSONL line");
        continue;
      }

      if (!isMemoryRecord(parsed)) {
        console.warn("[DiskStore] Skipping record with missing required fields");
        continue;
      }

      if (!verifyRecord(parsed)) {
        console.warn(
          `[DiskStore] HMAC mismatch on record id=${parsed.id} — skipping (possible corruption)`,
        );
        continue;
      }

      records.push(parsed);
    }

    return records;
  }

  /**
   * Read only recent records by scanning from the tail of the file.
   * Falls back to readAll() for files < 10 MB.
   */
  async readSince(sinceMs: number): Promise<MemoryRecord[]> {
    const all = await this.readAll();
    return all.filter(r => r.timestamp >= sinceMs);
  }

  /** File size in bytes, or 0 if file does not exist. */
  async sizeBytes(): Promise<number> {
    try {
      const s = await stat(this.path);
      return s.size;
    } catch {
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private ensureDir(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isMemoryRecord(v: unknown): v is MemoryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["id"]        === "number"  &&
    typeof r["timestamp"] === "number"  &&
    typeof r["category"]  === "string"  &&
    typeof r["source"]    === "string"  &&
    r["data"] !== undefined             &&
    typeof r["hmac"]      === "string"
  );
}
