import type { SwarmEvent, SwarmEventHandler, SwarmNodeInfo } from '../types.js';

/**
 * GhostSwarmNode — represents one participant in the Ghost Swarm Intelligence Layer.
 *
 * Each VM, region, or service boundary runs a GhostSwarmNode. Agents registered on
 * the node process every inbound SwarmEvent. The controller broadcasts events to all
 * registered nodes.
 */
export class GhostSwarmNode {
  readonly id: string;
  readonly region: string;
  readonly role: string;
  private readonly agents: SwarmEventHandler[] = [];
  private readonly registeredAt: number = Date.now();

  constructor(id: string, opts: { region?: string; role?: string } = {}) {
    this.id = id;
    this.region = opts.region ?? 'default';
    this.role = opts.role ?? 'generic';
  }

  /** Attach an agent (any object with a process() method) or a bare handler function. */
  registerAgent(agent: { process: SwarmEventHandler } | SwarmEventHandler): void {
    if (typeof agent === 'function') {
      this.agents.push(agent);
    } else {
      this.agents.push(event => agent.process(event));
    }
  }

  /** Deliver an event — each registered agent processes it in order. */
  receive(event: SwarmEvent): void {
    for (const handler of this.agents) {
      try {
        handler(event);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[GhostSwarmNode:${this.id}] agent error: ${msg}`);
      }
    }
  }

  info(): SwarmNodeInfo {
    return {
      id: this.id,
      region: this.region,
      role: this.role,
      agentCount: this.agents.length,
      registeredAt: this.registeredAt,
    };
  }
}
