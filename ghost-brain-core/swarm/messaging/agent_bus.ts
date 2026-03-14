/**
 * GhostBrain Swarm AI — Agent Bus
 *
 * Type-safe in-process pub/sub message bus for inter-agent communication.
 * Built on Node.js EventEmitter so handlers run synchronously in publication
 * order — no race conditions between agents on the same tick.
 *
 * Usage:
 *   bus.subscribe("infra:node_alert", (msg) => { ... });
 *   bus.publish("infra:node_alert", agentName, { nodeName: "ghost-val-1", ... });
 */

import { EventEmitter } from "events";
import type {
  SwarmTopic,
  SwarmMessage,
  TopicPayloadMap,
} from "./event_channel.js";

// ---------------------------------------------------------------------------
// AgentBus
// ---------------------------------------------------------------------------

export class AgentBus {
  private readonly emitter = new EventEmitter();

  /** Maximum listeners per topic before Node.js warns. Override if needed. */
  constructor(maxListeners: number = 32) {
    this.emitter.setMaxListeners(maxListeners);
  }

  /**
   * Publish a message on a topic.
   * Returns the number of handlers that were called.
   */
  publish<T extends SwarmTopic>(
    topic:   T,
    from:    string,
    payload: TopicPayloadMap[T],
  ): number {
    const msg: SwarmMessage<T> = { topic, from, payload, timestamp: Date.now() };
    const listenerCount = this.emitter.listenerCount(topic);
    this.emitter.emit(topic, msg);
    return listenerCount;
  }

  /**
   * Subscribe to a specific topic.
   * Returns an unsubscribe function.
   */
  subscribe<T extends SwarmTopic>(
    topic:   T,
    handler: (msg: SwarmMessage<T>) => void,
  ): () => void {
    // Cast needed because EventEmitter uses untyped emit/on.
    const wrapper = (msg: SwarmMessage<T>) => handler(msg);
    this.emitter.on(topic, wrapper as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(topic, wrapper as (...args: unknown[]) => void);
    };
  }

  /**
   * Subscribe once — automatically removed after the first delivery.
   */
  once<T extends SwarmTopic>(
    topic:   T,
    handler: (msg: SwarmMessage<T>) => void,
  ): void {
    this.emitter.once(topic, handler as (...args: unknown[]) => void);
  }

  /** Remove all subscriptions. Called on swarm shutdown. */
  removeAll(): void {
    this.emitter.removeAllListeners();
  }

  /** Number of active subscribers for a topic. */
  listenerCount(topic: SwarmTopic): number {
    return this.emitter.listenerCount(topic);
  }
}
