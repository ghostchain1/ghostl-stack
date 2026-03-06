/**
 * GhostBlockNumber — branded block-number primitives for GhostChain.
 *
 * Wraps the raw `bigint` block number in a typed value object so callers
 * never confuse a block number with a chain ID, timestamp, or nonce.
 *
 * Features:
 *  - Strongly-typed `GhostBlockNumber` value object
 *  - Conversions: hex ↔ decimal ↔ bigint ↔ number
 *  - Arithmetic helpers (+, -, clamp, distance)
 *  - Named sentinel values (GENESIS, LATEST, PENDING, EARLIEST, SAFE, FINALIZED)
 *  - Polling-based `watchBlockNumber` for environments without WebSocket
 *  - `GhostBlockTag` ↔ `GhostBlockNumber` bridge utilities
 */

import type { GhostBlockTag, Hex } from "../native/types.js";
import { hexToBigInt, bigIntToHex } from "../native/hex.js";
import type { HttpProvider } from "../providers/HttpProvider.js";

// ── Value type ────────────────────────────────────────────────────────────────

declare const _blockNumberBrand: unique symbol;

/**
 * Branded bigint — a confirmed on-chain block number.
 * Use `GhostBlockNumber.from(n)` to create one.
 */
export type GhostBlockNumber = bigint & { readonly [_blockNumberBrand]: "GhostBlockNumber" };

// ── Sentinel tag constants ────────────────────────────────────────────────────

export type GhostBlockSentinel =
  | "latest"
  | "pending"
  | "earliest"
  | "safe"
  | "finalized";

export const GHOST_BLOCK_SENTINEL = {
  LATEST: "latest" as GhostBlockSentinel,
  PENDING: "pending" as GhostBlockSentinel,
  EARLIEST: "earliest" as GhostBlockSentinel,
  SAFE: "safe" as GhostBlockSentinel,
  FINALIZED: "finalized" as GhostBlockSentinel,
} as const;

/** Block 0 — the genesis block of every GhostChain layer. */
export const GHOST_GENESIS_BLOCK = 0n as GhostBlockNumber;

// ── Namespace / factory ───────────────────────────────────────────────────────

export const GhostBlockNumber = {
  // ── Constructors ────────────────────────────────────────────────────────

  /** Wrap a raw bigint as a `GhostBlockNumber`. Throws if negative. */
  from(value: bigint | number | string): GhostBlockNumber {
    const n = typeof value === "string"
      ? (value.startsWith("0x") ? hexToBigInt(value as Hex) : BigInt(value))
      : BigInt(value);
    if (n < 0n) throw new RangeError(`GhostBlockNumber must be non-negative, got ${n}`);
    return n as GhostBlockNumber;
  },

  /** Parse a hex string (with or without 0x prefix). */
  fromHex(hex: string): GhostBlockNumber {
    const h = hex.startsWith("0x") ? hex : `0x${hex}`;
    return hexToBigInt(h as Hex) as GhostBlockNumber;
  },

  /** Safe version of `from` — returns `undefined` on invalid input. */
  tryFrom(value: unknown): GhostBlockNumber | undefined {
    try {
      if (typeof value === "bigint") return GhostBlockNumber.from(value);
      if (typeof value === "number" && Number.isInteger(value) && value >= 0)
        return GhostBlockNumber.from(value);
      if (typeof value === "string") return GhostBlockNumber.from(value);
      return undefined;
    } catch {
      return undefined;
    }
  },

  // ── Conversions ─────────────────────────────────────────────────────────

  /** Emit as a 0x-prefixed hex string (suitable for JSON-RPC). */
  toHex(block: GhostBlockNumber): Hex {
    return bigIntToHex(block) as Hex;
  },

  /** Emit as a plain decimal string. */
  toString(block: GhostBlockNumber): string {
    return block.toString(10);
  },

  /**
   * Emit as a `number`. Throws `RangeError` if the value exceeds
   * `Number.MAX_SAFE_INTEGER` (blocks > 2^53-1 are theoretical but guarded).
   */
  toNumber(block: GhostBlockNumber): number {
    if (block > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(
        `GhostBlockNumber ${block} exceeds Number.MAX_SAFE_INTEGER`,
      );
    }
    return Number(block);
  },

  /** Return the raw `bigint`. */
  toBigInt(block: GhostBlockNumber): bigint {
    return block as bigint;
  },

  /**
   * Convert to a `GhostBlockTag` (eth_call / eth_getLogs compatible).
   * Sentinel strings are returned as-is; numeric blocks become hex tags.
   */
  toBlockTag(block: GhostBlockNumber | GhostBlockSentinel): GhostBlockTag {
    if (typeof block === "string") return block as GhostBlockTag;
    return bigIntToHex(block) as GhostBlockTag;
  },

  // ── Comparison ───────────────────────────────────────────────────────────

  eq(a: GhostBlockNumber, b: GhostBlockNumber): boolean {
    return a === b;
  },

  lt(a: GhostBlockNumber, b: GhostBlockNumber): boolean {
    return a < b;
  },

  lte(a: GhostBlockNumber, b: GhostBlockNumber): boolean {
    return a <= b;
  },

  gt(a: GhostBlockNumber, b: GhostBlockNumber): boolean {
    return a > b;
  },

  gte(a: GhostBlockNumber, b: GhostBlockNumber): boolean {
    return a >= b;
  },

  min(a: GhostBlockNumber, b: GhostBlockNumber): GhostBlockNumber {
    return (a < b ? a : b) as GhostBlockNumber;
  },

  max(a: GhostBlockNumber, b: GhostBlockNumber): GhostBlockNumber {
    return (a > b ? a : b) as GhostBlockNumber;
  },

  // ── Arithmetic ───────────────────────────────────────────────────────────

  /** Add `delta` blocks. `delta` may be negative; result is clamped to 0. */
  add(block: GhostBlockNumber, delta: bigint | number): GhostBlockNumber {
    const result = block + BigInt(delta);
    return (result < 0n ? 0n : result) as GhostBlockNumber;
  },

  /** Subtract `delta` blocks. Result is clamped to 0 (genesis). */
  sub(block: GhostBlockNumber, delta: bigint | number): GhostBlockNumber {
    const result = block - BigInt(delta);
    return (result < 0n ? 0n : result) as GhostBlockNumber;
  },

  /** Range of blocks between two numbers (absolute value). */
  distance(a: GhostBlockNumber, b: GhostBlockNumber): bigint {
    return a > b ? a - b : b - a;
  },

  /**
   * Clamp a block number to [min, max].
   */
  clamp(
    block: GhostBlockNumber,
    min: GhostBlockNumber,
    max: GhostBlockNumber,
  ): GhostBlockNumber {
    if (block < min) return min;
    if (block > max) return max;
    return block;
  },

  // ── Finality helpers ─────────────────────────────────────────────────────

  /**
   * Return the earliest block that can be considered "safe" given a
   * `confirmations` requirement relative to `latest`.
   *
   * @example
   *  // require 12 confirmations — a tx in `latest - 12` is safe
   *  const safeBlock = GhostBlockNumber.safeBlock(latest, 12n);
   */
  safeBlock(latest: GhostBlockNumber, confirmations: bigint | number): GhostBlockNumber {
    return GhostBlockNumber.sub(latest, confirmations);
  },

  /**
   * Check whether a given tx block is confirmed relative to latest.
   */
  isConfirmed(
    txBlock: GhostBlockNumber,
    latest: GhostBlockNumber,
    confirmations: bigint | number = 1n,
  ): boolean {
    return latest - txBlock >= BigInt(confirmations);
  },
} as const;

// ── On-chain fetching ─────────────────────────────────────────────────────────

/**
 * Fetch the current block number from a JSON-RPC provider.
 */
export async function getGhostBlockNumber(
  provider: HttpProvider,
): Promise<GhostBlockNumber> {
  return (await provider.getBlockNumber()) as GhostBlockNumber;
}

// ── Polling watcher ───────────────────────────────────────────────────────────

export type GhostBlockNumberCallback = (
  blockNumber: GhostBlockNumber,
  prev: GhostBlockNumber | null,
) => void | Promise<void>;

export interface GhostBlockNumberWatcherOptions {
  /** Poll interval in ms (default: 4_000) */
  pollMs?: number;
  /** Emit the current block immediately on start (default: false) */
  emitOnStart?: boolean;
}

/**
 * `GhostBlockNumberWatcher` — lightweight poller that emits the new
 * `GhostBlockNumber` whenever the chain head advances.
 *
 * Usage:
 * ```ts
 * const watcher = new GhostBlockNumberWatcher(provider)
 * watcher.on((n, prev) => console.log(`new block: ${n}, prev: ${prev}`))
 * watcher.start()
 * // later…
 * watcher.stop()
 * ```
 */
export class GhostBlockNumberWatcher {
  private readonly provider: HttpProvider;
  private readonly pollMs: number;
  private readonly emitOnStart: boolean;

  private _callbacks: GhostBlockNumberCallback[] = [];
  private _running = false;
  private _timer?: ReturnType<typeof setTimeout>;
  private _last: GhostBlockNumber | null = null;

  constructor(
    provider: HttpProvider,
    opts: GhostBlockNumberWatcherOptions = {},
  ) {
    this.provider = provider;
    this.pollMs = opts.pollMs ?? 4_000;
    this.emitOnStart = opts.emitOnStart ?? false;
  }

  /** Register a callback invoked on every new block. */
  on(cb: GhostBlockNumberCallback): this {
    this._callbacks.push(cb);
    return this;
  }

  /** Remove a registered callback. */
  off(cb: GhostBlockNumberCallback): this {
    this._callbacks = this._callbacks.filter((c) => c !== cb);
    return this;
  }

  /** Start polling. Returns `this` for chaining. */
  start(): this {
    if (this._running) return this;
    this._running = true;
    void this._poll(true);
    return this;
  }

  /** Stop polling. */
  stop(): this {
    this._running = false;
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    return this;
  }

  get isRunning(): boolean {
    return this._running;
  }

  /** The most recently observed block number, or `null` before first poll. */
  get latest(): GhostBlockNumber | null {
    return this._last;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _poll(first = false): Promise<void> {
    if (!this._running) return;

    try {
      const current = await getGhostBlockNumber(this.provider);
      const prev = this._last;

      if (first && this.emitOnStart) {
        this._last = current;
        await this._emit(current, null);
      } else if (prev === null || current > prev) {
        this._last = current;
        await this._emit(current, prev);
      }
    } catch {
      // swallow transport errors; retry next tick
    }

    if (this._running) {
      this._timer = setTimeout(() => void this._poll(), this.pollMs);
    }
  }

  private async _emit(
    current: GhostBlockNumber,
    prev: GhostBlockNumber | null,
  ): Promise<void> {
    for (const cb of this._callbacks) {
      try {
        await cb(current, prev);
      } catch {
        // swallow callback errors
      }
    }
  }
}

// ── Multi-layer block tracker ─────────────────────────────────────────────────

export type GhostLayerName = "l1" | "l2" | "l3" | string;

export interface GhostLayerBlockNumbers {
  [layer: GhostLayerName]: GhostBlockNumber | null;
}

export type GhostLayerBlockCallback = (
  layer: GhostLayerName,
  blockNumber: GhostBlockNumber,
  prev: GhostBlockNumber | null,
) => void | Promise<void>;

/**
 * `GhostMultiLayerBlockTracker` — watches multiple GhostChain layers
 * simultaneously, emitting which layer advanced and by how much.
 *
 * Usage:
 * ```ts
 * const tracker = new GhostMultiLayerBlockTracker({
 *   l1: l1Provider,
 *   l2: l2Provider,
 * })
 * tracker.on((layer, n) => console.log(`${layer} → block ${n}`))
 * tracker.start()
 * ```
 */
export class GhostMultiLayerBlockTracker {
  private readonly watchers = new Map<GhostLayerName, GhostBlockNumberWatcher>();
  private _callbacks: GhostLayerBlockCallback[] = [];

  constructor(
    layers: Record<GhostLayerName, HttpProvider>,
    opts: GhostBlockNumberWatcherOptions = {},
  ) {
    for (const [name, provider] of Object.entries(layers)) {
      const w = new GhostBlockNumberWatcher(provider, opts);
      w.on((n, prev) => this._emit(name, n, prev));
      this.watchers.set(name, w);
    }
  }

  on(cb: GhostLayerBlockCallback): this {
    this._callbacks.push(cb);
    return this;
  }

  off(cb: GhostLayerBlockCallback): this {
    this._callbacks = this._callbacks.filter((c) => c !== cb);
    return this;
  }

  start(): this {
    for (const w of this.watchers.values()) w.start();
    return this;
  }

  stop(): this {
    for (const w of this.watchers.values()) w.stop();
    return this;
  }

  /** Snapshot of the latest known block per layer. */
  snapshot(): GhostLayerBlockNumbers {
    const out: GhostLayerBlockNumbers = {};
    for (const [name, w] of this.watchers.entries()) {
      out[name] = w.latest;
    }
    return out;
  }

  private async _emit(
    layer: GhostLayerName,
    n: GhostBlockNumber,
    prev: GhostBlockNumber | null,
  ): Promise<void> {
    for (const cb of this._callbacks) {
      try {
        await cb(layer, n, prev);
      } catch {
        // swallow
      }
    }
  }
}
