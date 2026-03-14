/**
 * GhostUtils — general-purpose utility barrel for @ghostchain/sdk.
 *
 * Re-exports the most useful utilities from across the native layer
 * so callers can import everything from a single path.
 */

// ── Hex utilities ─────────────────────────────────────────────────────────────
export {
  isHex,
  assertHex,
  strip0x,
  add0x,
  padHex,
  hexToBigInt,
  bigIntToHex,
  hexConcat,
} from "../native/hex.js";

// ── Bytes utilities ───────────────────────────────────────────────────────────
export {
  hexToBytes,
  bytesToHex,
  utf8ToBytes,
} from "../native/bytes.js";

// ── Address utilities ─────────────────────────────────────────────────────────
export {
  isAddress,
  assertAddress,
  toChecksumAddress,
  normalizeAddress,
  addressToBytes,
  GHOST_ZERO_ADDRESS,
  GHOST_DEAD_ADDRESS,
  isZeroAddress,
  addressEqual,
  shortenAddress,
  getCreateAddress,
  getCreate2Address,
} from "../address/GhostAddress.js";

// ── Hash utilities ────────────────────────────────────────────────────────────
export {
  keccak256,
  keccak256Hex,
  keccak256Utf8,
  keccak256Raw,
  sha256,
  sha256Hex,
  solidityKeccak256,
  eventTopic,
  functionSelector,
  GHOST_EMPTY_HASH,
  GHOST_ZERO_HASH,
  GHOST_TOPICS,
  type GhostHash,
} from "../hash/GhostHash.js";

// ── Signature utilities ───────────────────────────────────────────────────────
export {
  splitSignature,
  joinSignature,
  recoverAddress,
  recoverPersonalSignAddress,
  verifySignature,
  verifyPersonalSign,
  personalSignHash,
  hashMessage,
  compactToFull,
  fullToCompact,
  type GhostSignatureComponents,
} from "../signature/GhostSignature.js";

// ── Gas formatting ────────────────────────────────────────────────────────────
export {
  formatWei,
  formatGwei,
  parseGhost,
  parseGwei,
} from "../gas/GhostGasTracker.js";

// ── Time / sleep ──────────────────────────────────────────────────────────────

/** Sleep for a given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry an async function up to `maxAttempts` times with exponential backoff. */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        await sleep(initialDelayMs * 2 ** i);
      }
    }
  }
  throw lastErr;
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

/** Convert a number ≤ 0xFF to a 2-char hex string (no "0x" prefix). */
export function byteToHex(b: number): string {
  return b.toString(16).padStart(2, "0");
}

/** Convert a bigint to a zero-padded hex string of `byteLen` bytes (no prefix). */
export function bigIntToRawHex(n: bigint, byteLen: number): string {
  return n.toString(16).padStart(byteLen * 2, "0");
}

/** Chunk a Uint8Array into `chunkSize` slices. */
export function chunkBytes(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

/** Concatenate multiple Uint8Arrays. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** Constant-time bytes equality check. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
