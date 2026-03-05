import WebSocket from "ws";
import { randomUUID } from "crypto";
import { GhostBrainError } from "../errors.js";
import { sleep } from "../utils/backoff.js";
import type { GhostWsMessage, GhostWsResponse } from "./TaskTypes.js";

export interface GhostBrainWSOptions {
  url:       string;
  apiKey:    string;
  clientId:  string;
  timeoutMs?: number;
  reconnectMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject:  (reason: unknown) => void;
  timer:   ReturnType<typeof setTimeout>;
}

export class GhostBrainWS {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private reconnecting = false;
  private readonly opts: Required<GhostBrainWSOptions>;

  constructor(opts: GhostBrainWSOptions) {
    this.opts = {
      timeoutMs:    opts.timeoutMs   ?? 5_000,
      reconnectMs:  opts.reconnectMs ?? 3_000,
      ...opts,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url, {
        headers: {
          "x-ghost-api-key":   this.opts.apiKey,
          "x-ghost-client-id": this.opts.clientId,
        },
      });

      ws.once("open", () => {
        this.ws = ws;
        resolve();
      });

      ws.once("error", reject);

      ws.on("message", (raw: Buffer | string) => {
        this.onMessage(typeof raw === "string" ? raw : raw.toString());
      });

      ws.on("close", () => {
        this.ws = null;
        void this.scheduleReconnect();
      });
    });
  }

  private onMessage(raw: string): void {
    let msg: GhostWsResponse;
    try { msg = JSON.parse(raw) as GhostWsResponse; }
    catch { return; }

    const p = this.pending.get(msg.id);
    if (!p) return;

    clearTimeout(p.timer);
    this.pending.delete(msg.id);

    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      p.reject(new GhostBrainError(msg.error ?? "ghost brain error"));
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    await sleep(this.opts.reconnectMs);
    this.reconnecting = false;
    try { await this.connect(); } catch { /* will retry on next close */ }
  }

  async request<T>(
    topic:   string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any>,
    opts?: { timeoutMs?: number }
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new GhostBrainError("GhostBrainWS: not connected");
    }

    const id      = randomUUID();
    const timeout = opts?.timeoutMs ?? this.opts.timeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GhostBrainError(`GhostBrainWS: timeout on topic=${topic}`));
      }, timeout);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      const msg: GhostWsMessage = { id, topic, payload };
      this.ws!.send(JSON.stringify(msg));
    });
  }

  close(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new GhostBrainError("GhostBrainWS: connection closed"));
    }
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }
}
