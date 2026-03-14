/**
 * GhostWebSocketProvider — real-time subscriptions over WebSocket.
 *
 * Supports:
 *   - newHeads (new blocks)
 *   - newPendingTransactions
 *   - logs (event subscriptions)
 *   - eth_subscribe / eth_unsubscribe
 *
 * Works in both browser (native WebSocket) and Node.js ≥22 (native WebSocket).
 *
 * Usage:
 *   const ws = new GhostWebSocketProvider("wss://rpc.ghostchain/ws")
 *   await ws.connect()
 *   const sub = await ws.subscribeNewHeads(header => console.log(header))
 *   await ws.unsubscribe(sub)
 *   ws.close()
 */

import type { Hex, GhostAddress } from "../native/types.js";
import { GhostTransportError } from "../errors/GhostErrors.js";

export type WsNewHeadEvent = {
  number: Hex;
  hash: Hex;
  parentHash: Hex;
  timestamp: Hex;
  baseFeePerGas?: Hex;
};

export type WsLogEvent = {
  address: GhostAddress;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed: boolean;
};

type SubscriptionCallback<T> = (data: T) => void;
type SubscriptionId = Hex;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class GhostWebSocketProvider {
  private ws: WebSocket | null = null;
  private id = 1;
  private pending = new Map<number, PendingRequest>();
  private subscriptions = new Map<SubscriptionId, SubscriptionCallback<unknown>>();
  private reconnectAttempts = 0;
  private closed = false;

  constructor(
    private readonly wsUrl: string,
    private readonly opts: { maxReconnects?: number; reconnectDelayMs?: number } = {}
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === "undefined") {
        reject(new GhostTransportError("WebSocket not available in this environment"));
        return;
      }
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      ws.onerror = (e) => {
        reject(new GhostTransportError(`WebSocket error: ${String(e)}`));
      };

      ws.onmessage = (ev) => this._onMessage(ev.data as string);

      ws.onclose = () => {
        if (!this.closed) this._onClose();
      };
    });
  }

  private _onMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw) as Record<string, unknown>; }
    catch { return; }

    // Subscription notification
    if (msg["method"] === "eth_subscription") {
      const params = msg["params"] as { subscription: SubscriptionId; result: unknown } | undefined;
      if (params) {
        const cb = this.subscriptions.get(params.subscription);
        if (cb) cb(params.result);
      }
      return;
    }

    // RPC response
    const id = msg["id"] as number | undefined;
    if (id !== undefined) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        if (msg["error"]) {
          const err = msg["error"] as { message: string };
          pending.reject(new GhostTransportError(err.message));
        } else {
          pending.resolve(msg["result"]);
        }
      }
    }
  }

  private async _onClose(): Promise<void> {
    const max = this.opts.maxReconnects ?? 5;
    if (this.reconnectAttempts >= max) return;
    this.reconnectAttempts++;
    const delay = this.opts.reconnectDelayMs ?? 1000;
    await new Promise(r => setTimeout(r, delay * this.reconnectAttempts));
    try { await this.connect(); } catch { /* exhaust reconnects silently */ }
  }

  private _send<T>(method: string, params: unknown[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new GhostTransportError("WebSocket not connected"));
        return;
      }
      const id = this.id++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async subscribeNewHeads(cb: SubscriptionCallback<WsNewHeadEvent>): Promise<SubscriptionId> {
    const subId = await this._send<SubscriptionId>("eth_subscribe", ["newHeads"]);
    this.subscriptions.set(subId, cb as SubscriptionCallback<unknown>);
    return subId;
  }

  async subscribeNewPendingTransactions(cb: SubscriptionCallback<Hex>): Promise<SubscriptionId> {
    const subId = await this._send<SubscriptionId>("eth_subscribe", ["newPendingTransactions"]);
    this.subscriptions.set(subId, cb as SubscriptionCallback<unknown>);
    return subId;
  }

  async subscribeLogs(
    filter: { address?: GhostAddress | GhostAddress[]; topics?: (Hex | Hex[] | null)[] },
    cb: SubscriptionCallback<WsLogEvent>
  ): Promise<SubscriptionId> {
    const subId = await this._send<SubscriptionId>("eth_subscribe", ["logs", filter]);
    this.subscriptions.set(subId, cb as SubscriptionCallback<unknown>);
    return subId;
  }

  async unsubscribe(subId: SubscriptionId): Promise<boolean> {
    this.subscriptions.delete(subId);
    return this._send<boolean>("eth_unsubscribe", [subId]);
  }

  // ── Standard requests ─────────────────────────────────────────────────────

  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    return this._send<T>(method, params);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
