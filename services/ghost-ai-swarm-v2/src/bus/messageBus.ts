/**
 * GhostBrain Message Bus
 *
 * In-process pub/sub event bus connecting all 15 AI agents.
 * Agents publish events; the orchestrator and other agents subscribe.
 *
 * Pattern: Architect → Executor → Auditor → Governor
 */

import { EventEmitter } from "node:events";
import { randomUUID }   from "node:crypto";
import type { BusEvent, BusEventType, AgentRole } from "../types.js";

class MessageBus extends EventEmitter {
  private readonly history: BusEvent[] = [];
  private readonly MAX_HISTORY = 1_000;

  /** Publish an event to all subscribers. */
  publish<T>(
    type: BusEventType,
    source: AgentRole | "orchestrator" | "bus",
    payload: T,
  ): BusEvent<T> {
    const event: BusEvent<T> = {
      id:        randomUUID(),
      type,
      source,
      payload,
      timestamp: Date.now(),
    };

    // Archive
    this.history.push(event as BusEvent);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // Broadcast
    this.emit(type, event);
    this.emit("*", event);          // wildcard listener
    return event;
  }

  /** Subscribe to a specific event type. */
  subscribe<T>(
    type: BusEventType | "*",
    handler: (event: BusEvent<T>) => void,
  ): void {
    this.on(type, handler as (e: BusEvent) => void);
  }

  /** Unsubscribe a handler. */
  unsubscribe<T>(
    type: BusEventType | "*",
    handler: (event: BusEvent<T>) => void,
  ): void {
    this.off(type, handler as (e: BusEvent) => void);
  }

  /** Return recent event history. */
  getHistory(limit = 100): BusEvent[] {
    return this.history.slice(-limit);
  }

  /** Return events of a specific type. */
  getByType(type: BusEventType, limit = 50): BusEvent[] {
    return this.history
      .filter(e => e.type === type)
      .slice(-limit);
  }

  /** Return the count of events seen. */
  get totalEvents(): number {
    return this.history.length;
  }
}

// Singleton — one bus per process
export const bus = new MessageBus();
bus.setMaxListeners(100);   // 15 agents × 6+ event types each
