/**
 * WebSocket service — wraps Socket.IO client.
 * Connects to the LitVybzLive backend for real-time dashboard events.
 */

import { io, Socket } from "socket.io-client";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000");

type Callback = (data: unknown) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Callback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(): void {
    if (this.socket?.connected) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("ghost_admin_token") : null;

    this.socket = io(WS_URL, {
      auth:              { token },
      transports:        ["websocket"],
      reconnection:      true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on("connect", () => {
      this.reconnectAttempts = 0;
      console.log("[WS] connected", this.socket?.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.warn("[WS] disconnected:", reason);
    });

    this.socket.on("connect_error", (err) => {
      this.reconnectAttempts++;
      console.error(`[WS] connect_error (attempt ${this.reconnectAttempts}):`, err.message);
    });

    // Route all incoming events to registered callbacks
    this.socket.onAny((event: string, data: unknown) => {
      const cbs = this.listeners.get(event);
      if (cbs) cbs.forEach((cb) => cb(data));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  subscribe(channel: string, callback: Callback): () => void {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(callback);
    // Return unsubscribe handle
    return () => this.unsubscribe(channel, callback);
  }

  unsubscribe(channel: string, callback: Callback): void {
    this.listeners.get(channel)?.delete(callback);
  }

  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.warn("[WS] emit called while disconnected — queuing is not supported");
      return;
    }
    this.socket.emit(event, data);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Singleton — safe to import across components
export const wsService = new WebSocketService();
