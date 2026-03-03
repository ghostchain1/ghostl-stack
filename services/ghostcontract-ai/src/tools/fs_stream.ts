/**
 * GhostContractAI — Streaming File Reader (memory-safe)
 *
 * Reads files in chunks, enforcing per-file and per-job byte budgets.
 * Never loads an entire file into memory at once.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as path from "node:path";
import type { WorkspaceState } from "../types/jobs.js";
import { checkAllowedPath } from "../core/policy.js";

export interface StreamReadResult {
  content: string;
  bytesRead: number;
  sha256: string;
  truncated: boolean;
}

/**
 * Read a file safely within workspace budget limits.
 * Returns truncated content if file exceeds per-file or total budget.
 */
export async function streamReadFile(
  filePath: string,
  ws: WorkspaceState,
  maxFileBytesOverride?: number,
): Promise<StreamReadResult> {
  // Policy: path must be within allowed roots
  checkAllowedPath(filePath, ws.allowedRoots);

  const maxFileBytes = maxFileBytesOverride ?? 1_048_576; // 1 MB default
  const remaining = ws.bytesReadLimit - ws.bytesRead;
  const effectiveMax = Math.min(maxFileBytes, remaining);

  if (effectiveMax <= 0) {
    throw new Error(`Job byte budget exhausted (limit=${ws.bytesReadLimit})`);
  }

  const info = await stat(filePath);
  const toRead = Math.min(info.size, effectiveMax);
  const truncated = info.size > effectiveMax;

  const chunks: Buffer[] = [];
  let bytesRead = 0;
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 0, end: toRead - 1 });
    stream.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buf);
      chunks.push(buf);
      bytesRead += buf.length;
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  // Update workspace state (mutate in-place — caller passes same ref)
  ws.bytesRead += bytesRead;
  ws.filesRead += 1;

  return {
    content: Buffer.concat(chunks).toString("utf8"),
    bytesRead,
    sha256: hash.digest("hex"),
    truncated,
  };
}

/**
 * Compute SHA-256 of a file without loading it fully into memory.
 * Used for before/after hashing in evidence packs.
 */
export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * Write content to a file (only within allowed roots).
 * Returns sha256 of written content.
 */
export async function writeAllowedFile(
  filePath: string,
  content: string,
  allowedRoots: string[],
): Promise<string> {
  checkAllowedPath(filePath, allowedRoots);
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(content, "utf8");
  await writeFile(filePath, buf);
  return createHash("sha256").update(buf).digest("hex");
}
