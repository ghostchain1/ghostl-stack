import type { SwarmEvent } from '../types.js';

/**
 * GhostAgentBase — abstract base class for all swarm agents.
 *
 * Agents receive SwarmEvents via process() and perform their specialized action.
 * Subclasses override process() with their domain logic.
 */
export abstract class GhostAgentBase {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Process an inbound swarm event. Override in subclasses. */
  abstract process(event: SwarmEvent): void | Promise<void>;

  /** Helper: emit a structured log from within an agent. */
  protected log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      agent: this.name,
      msg,
      ...extra,
    };
    const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    out(JSON.stringify(entry));
  }
}
