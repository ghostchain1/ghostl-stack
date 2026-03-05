/**
 * useGhostWallet
 *
 * Framework-agnostic wallet state factory.
 *
 * This is NOT a React hook — it is a vanilla reactive state object that
 * can be wrapped by any framework adapter (React, Vue, Svelte, etc.)
 *
 * ### React integration example:
 *
 * ```tsx
 * import { createGhostWalletState } from "@ghostchain/sdk/next";
 * import { useState, useEffect } from "react";
 * import { GhostWalletAdapter } from "@ghostchain/sdk/next";
 *
 * const walletState = createGhostWalletState("L2");
 *
 * export function useGhostWallet() {
 *   const [state, setState] = useState(walletState.snapshot());
 *   useEffect(() => walletState.subscribe((s) => setState({ ...s })), []);
 *   return {
 *     ...state,
 *     connect:    walletState.connect.bind(walletState),
 *     disconnect: walletState.disconnect.bind(walletState),
 *     signMessage: walletState.signMessage.bind(walletState),
 *   };
 * }
 * ```
 *
 * ### Next.js 14 / App Router usage:
 * Use in a Client Component (`"use client"`) since it requires state.
 */

import {
  GhostWalletAdapter,
  WalletAdapterConfig,
  WalletAdapterState,
  WalletAdapterInfo,
} from "./GhostWalletAdapter.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GhostWalletSnapshot {
  state:    WalletAdapterState;
  address:  string | null;
  info:     WalletAdapterInfo | null;
  error:    string | null;
}

export type GhostWalletSubscriber = (snapshot: GhostWalletSnapshot) => void;

// ── GhostWalletState ───────────────────────────────────────────────────────────

/**
 * Reactive wallet state container.
 * Can be shared across components or used in a singleton per-page module.
 */
export class GhostWalletState {
  private readonly adapter: GhostWalletAdapter;
  private _error:           string | null = null;
  private _info:            WalletAdapterInfo | null = null;
  private _subscribers:     Set<GhostWalletSubscriber> = new Set();
  private _unsub:           (() => void) | null = null;

  constructor(config: WalletAdapterConfig = {}) {
    this.adapter = new GhostWalletAdapter(config);
    this._unsub  = this.adapter.onStateChange((state, info) => {
      this._info = info;
      this._notify();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Get current snapshot (suitable for initial render). */
  snapshot(): GhostWalletSnapshot {
    return {
      state:   this.adapter.state,
      address: this.adapter.address,
      info:    this._info,
      error:   this._error,
    };
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe(fn: GhostWalletSubscriber): () => void {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  async connect(privateKey?: string): Promise<void> {
    this._error = null;
    try {
      // Re-create adapter with key if provided
      if (privateKey) {
        (this.adapter as unknown as { _key: string })["_key"] = privateKey;
      }
      this._info = await this.adapter.connect();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._notify();
    }
  }

  disconnect(): void {
    this.adapter.disconnect();
    this._info  = null;
    this._error = null;
    this._notify();
  }

  async signMessage(message: string): Promise<string> {
    return this.adapter.signMessage(message);
  }

  /** Clean up listeners. Call when the component or module is destroyed. */
  destroy(): void {
    this._unsub?.();
    this._unsub = null;
    this._subscribers.clear();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _notify(): void {
    const snap = this.snapshot();
    for (const fn of this._subscribers) {
      try { fn(snap); } catch { /* ignore subscriber errors */ }
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a GhostWalletState for a specific layer.
 * Call once per app, share the instance across components.
 */
export function createGhostWalletState(config: WalletAdapterConfig | "L1" | "L2" | "L3" = "L2"): GhostWalletState {
  const cfg: WalletAdapterConfig = typeof config === "string" ? { layer: config } : config;
  return new GhostWalletState(cfg);
}

// Re-export adapter types
export type { WalletAdapterState, WalletAdapterInfo, WalletAdapterConfig };
