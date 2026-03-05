/**
 * GhostWalletAdapter
 *
 * Framework-agnostic wallet adapter for GhostStack.
 * Wraps GhostNativeWallet with a clean connect/disconnect/sign lifecycle.
 *
 * Designed as the underlying engine for React/Next hooks (useGhostWallet)
 * and can also be used standalone in Node.js or CLI contexts.
 *
 * Usage:
 *   const adapter = new GhostWalletAdapter({ privateKey: "0x..." });
 *   await adapter.connect();
 *   const sig = await adapter.signMessage("hello");
 *   adapter.disconnect();
 */

import { GhostLayer } from "../networks.js";
import { GhostNativeProvider } from "../native/GhostNativeProvider.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type WalletAdapterState = "disconnected" | "connecting" | "connected" | "error";

export interface WalletAdapterConfig {
  /** Private key (hex, with or without 0x prefix). If omitted, adapter is read-only. */
  privateKey?:  string;
  /** Target layer. Default: "L2" */
  layer?:       GhostLayer;
  /** Override RPC endpoint */
  rpc?:         string;
}

export interface WalletAdapterInfo {
  address:    string;
  layer:      GhostLayer;
  chainId:    number;
  connected:  boolean;
}

export type WalletAdapterListener = (state: WalletAdapterState, info: WalletAdapterInfo | null) => void;

// ── GhostWalletAdapter ─────────────────────────────────────────────────────────

export class GhostWalletAdapter {
  private _state:    WalletAdapterState = "disconnected";
  private _address:  string | null = null;
  private _provider: GhostNativeProvider | null = null;
  private _key:      string | null;
  private _layer:    GhostLayer;
  private _rpc:      string | undefined;
  private _listeners: Set<WalletAdapterListener> = new Set();

  constructor(config: WalletAdapterConfig = {}) {
    this._key   = config.privateKey ?? null;
    this._layer = config.layer ?? "L2";
    this._rpc   = config.rpc;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  get state():   WalletAdapterState { return this._state; }
  get address(): string | null      { return this._address; }
  get layer():   GhostLayer         { return this._layer; }
  get isConnected(): boolean        { return this._state === "connected"; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<WalletAdapterInfo> {
    if (this._state === "connected") return this._info()!;
    this._setState("connecting");

    try {
      const opts: Record<string, unknown> = { layer: this._layer };
      if (this._rpc) opts["rpcUrl"] = this._rpc;

      this._provider = new GhostNativeProvider(opts as Parameters<typeof GhostNativeProvider.prototype.constructor>[0]);

      if (this._key) {
        const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
        const wallet = new GhostNativeWallet(this._key, this._provider);
        this._address = await wallet.getAddress();
      } else {
        // Read-only: derive a zero address placeholder
        this._address = "0x0000000000000000000000000000000000000000";
      }

      this._setState("connected");
      return this._info()!;
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  disconnect(): void {
    this._state    = "disconnected";
    this._address  = null;
    this._provider = null;
    this._emit();
  }

  /** Sign a raw message. Requires a private key. */
  async signMessage(message: string): Promise<string> {
    this._requireConnected();
    if (!this._key) throw new Error("GhostWalletAdapter: read-only adapter cannot sign");

    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
    const wallet = new GhostNativeWallet(this._key, this._provider!);
    return wallet.signMessage(message);
  }

  /** Send a transaction. Requires a private key. */
  async sendTransaction(tx: {
    to:      string;
    value?:  bigint;
    data?:   string;
    gas?:    bigint;
  }): Promise<string> {
    this._requireConnected();
    if (!this._key) throw new Error("GhostWalletAdapter: read-only adapter cannot send transactions");

    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");
    const wallet = new GhostNativeWallet(this._key, this._provider!);
    const receipt = await wallet.sendTransaction({
      to:     tx.to as `0x${string}`,
      value:  tx.value,
      data:   tx.data as `0x${string}` | undefined,
      gas:    tx.gas,
    });
    return receipt.hash;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  onStateChange(fn: WalletAdapterListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _info(): WalletAdapterInfo | null {
    if (!this._address) return null;
    return {
      address:   this._address,
      layer:     this._layer,
      chainId:   this._layer === "L1" ? 14000101 : this._layer === "L2" ? 901 : 903,
      connected: this._state === "connected",
    };
  }

  private _setState(state: WalletAdapterState): void {
    this._state = state;
    this._emit();
  }

  private _emit(): void {
    const info = this._info();
    for (const fn of this._listeners) {
      try { fn(this._state, info); } catch { /* ignore */ }
    }
  }

  private _requireConnected(): void {
    if (this._state !== "connected") throw new Error("GhostWalletAdapter: not connected");
  }
}
