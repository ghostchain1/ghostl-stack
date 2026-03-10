/**
 * Swarm Event Bus — strongly-typed EventEmitter over the Node.js stdlib.
 * No external dependencies. No shell access.
 */
import { EventEmitter } from "events";
import type { SwarmEventMap, SwarmEventName } from "../types";

class SwarmBus extends EventEmitter {
  private _history: Array<{ event: SwarmEventName; payload: unknown; ts: string }> = [];
  private readonly MAX_HISTORY = 200;

  emit<K extends SwarmEventName>(event: K, payload: SwarmEventMap[K]): boolean {
    const entry = { event, payload, ts: new Date().toISOString() };
    this._history.push(entry);
    if (this._history.length > this.MAX_HISTORY) {
      this._history.shift();
    }
    return super.emit(event, payload);
  }

  on<K extends SwarmEventName>(
    event: K,
    listener: (payload: SwarmEventMap[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends SwarmEventName>(
    event: K,
    listener: (payload: SwarmEventMap[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /** Recent event history for health/debug endpoints. */
  getHistory(n = 20) {
    return this._history.slice(-n);
  }
}

export const swarmBus = new SwarmBus();
