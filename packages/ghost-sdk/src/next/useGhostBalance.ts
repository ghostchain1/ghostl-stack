/**
 * useGhostBalance — framework-agnostic reactive GST balance state factory.
 *
 * Returns live GST balance for a given address / layer, auto-refreshing on
 * each new block (or at a configurable interval in environments without
 * WebSocket support).
 *
 * ### React integration example:
 *
 * ```tsx
 * import { createGhostBalanceState, type GhostBalanceSnapshot } from "@ghostchain/sdk/next";
 * import { useState, useEffect } from "react";
 * import { formatGhost } from "@ghostchain/sdk";
 *
 * const balanceState = createGhostBalanceState("0xYourAddress", "L3");
 * balanceState.startPolling(5_000);
 *
 * export function useGhostBalance(address: string, layer = "L3") {
 *   const [snap, setSnap] = useState<GhostBalanceSnapshot>(balanceState.snapshot());
 *   useEffect(() => balanceState.subscribe(setSnap), []);
 *   return {
 *     ...snap,
 *     formatted: snap.balance !== null ? formatGhost(snap.balance) : null,
 *   };
 * }
 * ```
 *
 * ### Next.js App Router:
 * Use inside a Client Component (`"use client"`).
 */

import { GhostNativeProvider } from "../native/GhostNativeProvider.js";
import { GhostNetworks, type GhostLayer } from "../networks.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type GhostBalanceStatus = "idle" | "loading" | "success" | "error";

export interface GhostBalanceSnapshot {
  /** Current raw balance in wei (bigint), or null before first load. */
  balance: bigint | null;
  /** Block number at which balance was last fetched. */
  blockNumber: bigint | null;
  /** Loading / success / error status. */
  status: GhostBalanceStatus;
  /** Error message if status is "error". */
  error: string | null;
  /** Address being tracked. */
  address: string;
  /** Layer being queried. */
  layer: GhostLayer;
}

export type GhostBalanceSubscriber = (snapshot: GhostBalanceSnapshot) => void;

// ── GhostBalanceState ──────────────────────────────────────────────────────────

/**
 * Reactive balance state container.
 * Can be shared across components or instantiated per-component.
 */
export class GhostBalanceState {
  private readonly provider: GhostNativeProvider;
  private readonly _address: string;
  private readonly _layer: GhostLayer;
  private _snap: GhostBalanceSnapshot;
  private _subscribers = new Set<GhostBalanceSubscriber>();
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(address: string, layer: GhostLayer, rpcOverride?: string) {
    const rpc = rpcOverride ?? GhostNetworks[layer].rpc;
    this.provider = new GhostNativeProvider({ rpcUrl: rpc });
    this._address = address;
    this._layer   = layer;
    this._snap = {
      balance:     null,
      blockNumber: null,
      status:      "idle",
      error:       null,
      address,
      layer,
    };
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  subscribe(fn: GhostBalanceSubscriber): () => void {
    this._subscribers.add(fn);
    fn({ ...this._snap });
    return () => this._subscribers.delete(fn);
  }

  snapshot(): GhostBalanceSnapshot {
    return { ...this._snap };
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────

  async fetch(): Promise<GhostBalanceSnapshot> {
    this._update({ status: "loading", error: null });
    try {
      const [rawBalance, rawBlock] = await Promise.all([
        this.provider.getBalance(this._address as `0x${string}`),
        this.provider.getBlockNumber(),
      ]);
      this._update({
        balance:     rawBalance,
        blockNumber: BigInt(rawBlock),
        status:      "success",
        error:       null,
      });
    } catch (err: unknown) {
      this._update({
        status: "error",
        error:  err instanceof Error ? err.message : String(err),
      });
    }
    return { ...this._snap };
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  /**
   * Start auto-refreshing the balance every `intervalMs` milliseconds.
   * Default: 5000 ms (5 s).
   */
  startPolling(intervalMs = 5_000): this {
    this.stopPolling();
    void this.fetch();
    this._timer = setInterval(() => void this.fetch(), intervalMs);
    if (typeof this._timer !== "number" && typeof (this._timer as NodeJS.Timeout).unref === "function") {
      (this._timer as NodeJS.Timeout).unref();
    }
    return this;
  }

  stopPolling(): this {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private _update(patch: Partial<GhostBalanceSnapshot>): void {
    this._snap = { ...this._snap, ...patch };
    for (const fn of this._subscribers) fn({ ...this._snap });
  }
}

// ── Factory (convenience) ─────────────────────────────────────────────────────

/**
 * Create a new reactive balance state for `address` on `layer`.
 *
 * @param address  EVM address to track (0x-prefixed)
 * @param layer    GhostStack layer — "L1" | "L2" | "L3" (default "L3")
 * @param rpc      Optional RPC URL override
 */
export function createGhostBalanceState(
  address: string,
  layer: GhostLayer = "L3",
  rpc?: string,
): GhostBalanceState {
  return new GhostBalanceState(address, layer, rpc);
}
