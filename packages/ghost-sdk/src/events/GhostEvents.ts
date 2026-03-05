/**
 * GhostEvents — typed publish/subscribe event bus for GhostStack.
 *
 * Usage:
 *   const events = new GhostEvents();
 *   events.on("tx:sent", (data) => console.log(data));
 *   events.emit("tx:sent", { hash: "0x..." });
 *
 * Strongly-typed variant:
 *   const bus = new GhostTypedEvents<{ "block": number; "error": Error }>();
 *   bus.on("block", (n) => console.log("new block", n));
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type GhostEventListener<T = unknown> = (data: T) => void | Promise<void>;

export interface GhostEventSubscription {
  /** Cancel this subscription. */
  off(): void;
}

// ── Built-in GhostStack event names ─────────────────────────────────────────

export type GhostSystemEvent =
  | "rpc:connected"
  | "rpc:disconnected"
  | "rpc:error"
  | "block:new"
  | "tx:sent"
  | "tx:confirmed"
  | "tx:failed"
  | "bridge:deposit"
  | "bridge:withdraw"
  | "bridge:finalized"
  | "gas:updated"
  | "wallet:connected"
  | "wallet:disconnected";

// ── GhostEvents (untyped) ────────────────────────────────────────────────────

export class GhostEvents {
  private _listeners: Map<string, Set<GhostEventListener>> = new Map();
  private _once:      Map<string, Set<GhostEventListener>> = new Map();

  /** Subscribe to an event. Returns a subscription handle with `.off()`. */
  on<T = unknown>(event: string, fn: GhostEventListener<T>): GhostEventSubscription {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    const listener = fn as GhostEventListener;
    this._listeners.get(event)!.add(listener);
    return { off: () => this.off(event, fn) };
  }

  /** Subscribe to an event, automatically unsubscribing after the first call. */
  once<T = unknown>(event: string, fn: GhostEventListener<T>): GhostEventSubscription {
    if (!this._once.has(event)) {
      this._once.set(event, new Set());
    }
    const listener = fn as GhostEventListener;
    this._once.get(event)!.add(listener);
    return { off: () => this._once.get(event)?.delete(listener) };
  }

  /** Unsubscribe a specific listener. */
  off<T = unknown>(event: string, fn: GhostEventListener<T>): void {
    this._listeners.get(event)?.delete(fn as GhostEventListener);
    this._once.get(event)?.delete(fn as GhostEventListener);
  }

  /** Remove all listeners for an event (or all events if none specified). */
  removeAll(event?: string): void {
    if (event) {
      this._listeners.delete(event);
      this._once.delete(event);
    } else {
      this._listeners.clear();
      this._once.clear();
    }
  }

  /** Emit an event, invoking all registered listeners. */
  emit<T = unknown>(event: string, data?: T): void {
    const permanent = this._listeners.get(event);
    const oneTimeSet  = this._once.get(event);

    if (permanent) {
      for (const fn of permanent) {
        void fn(data);
      }
    }

    if (oneTimeSet && oneTimeSet.size > 0) {
      const snapshot = [...oneTimeSet];
      oneTimeSet.clear();
      for (const fn of snapshot) {
        void fn(data);
      }
    }
  }

  /** Number of active listeners for a given event (or all events). */
  listenerCount(event?: string): number {
    if (event) {
      return (this._listeners.get(event)?.size ?? 0) +
             (this._once.get(event)?.size ?? 0);
    }
    let total = 0;
    for (const s of this._listeners.values()) total += s.size;
    for (const s of this._once.values())     total += s.size;
    return total;
  }

  /** All event names that currently have at least one listener. */
  eventNames(): string[] {
    return [...new Set([
      ...this._listeners.keys(),
      ...this._once.keys(),
    ])].filter(k =>
      (this._listeners.get(k)?.size ?? 0) > 0 ||
      (this._once.get(k)?.size ?? 0) > 0
    );
  }
}

// ── GhostTypedEvents (strongly typed variant) ────────────────────────────────

/** A type-safe event bus where event names and payload types are declared up front.
 *
 * @example
 * ```ts
 * type MyEvents = { "block": number; "error": Error; "tx": { hash: string } };
 * const bus = new GhostTypedEvents<MyEvents>();
 * bus.on("block", (n) => console.log(n)); // n is `number`
 * ```
 */
export class GhostTypedEvents<EventMap extends Record<string, unknown>> {
  private _bus = new GhostEvents();

  on<K extends keyof EventMap & string>(
    event: K,
    fn: GhostEventListener<EventMap[K]>
  ): GhostEventSubscription {
    return this._bus.on(event, fn);
  }

  once<K extends keyof EventMap & string>(
    event: K,
    fn: GhostEventListener<EventMap[K]>
  ): GhostEventSubscription {
    return this._bus.once(event, fn);
  }

  off<K extends keyof EventMap & string>(
    event: K,
    fn: GhostEventListener<EventMap[K]>
  ): void {
    this._bus.off(event, fn);
  }

  emit<K extends keyof EventMap & string>(event: K, data: EventMap[K]): void {
    this._bus.emit(event, data);
  }

  removeAll(event?: keyof EventMap & string): void {
    this._bus.removeAll(event);
  }

  listenerCount(event?: keyof EventMap & string): number {
    return this._bus.listenerCount(event);
  }
}

/** Shared singleton event bus for GhostStack system events. */
export const ghostEvents = new GhostTypedEvents<Record<GhostSystemEvent, unknown>>();
