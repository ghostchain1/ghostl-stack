/**
 * AgentRegistry — tracks all GhostBrain AI agents and their capabilities.
 */
export interface GhostAgent {
  name:         string;
  description:  string;
  react(event: GhostAgentEvent): Promise<GhostAgentResponse | null>;
}

export interface GhostAgentEvent {
  type:   string;
  data?:  Record<string, unknown>;
  source?: string;
}

export interface GhostAgentResponse {
  agent:   string;
  action:  string;
  risk:    "LOW" | "MEDIUM" | "HIGH";
  details?: Record<string, unknown>;
}

export class AgentRegistry {
  private agents: Map<string, GhostAgent> = new Map();

  register(agent: GhostAgent): void {
    this.agents.set(agent.name, agent);
  }

  get(name: string): GhostAgent | undefined {
    return this.agents.get(name);
  }

  list(): string[] {
    return [...this.agents.keys()];
  }

  all(): GhostAgent[] {
    return [...this.agents.values()];
  }
}
