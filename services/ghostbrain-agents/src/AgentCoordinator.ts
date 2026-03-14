/**
 * AgentCoordinator — coordinates multi-agent event processing and consensus.
 */
import { AgentRegistry, GhostAgentEvent, GhostAgentResponse } from "./AgentRegistry";

export class AgentCoordinator {
  private registry: AgentRegistry;

  constructor(registry: AgentRegistry) {
    this.registry = registry;
  }

  async coordinate(event: GhostAgentEvent): Promise<GhostAgentResponse[]> {
    const agents  = this.registry.all();
    const results = await Promise.allSettled(agents.map(a => a.react(event)));

    return results
      .filter((r): r is PromiseFulfilledResult<GhostAgentResponse | null> => r.status === "fulfilled")
      .map(r => r.value)
      .filter((v): v is GhostAgentResponse => v !== null);
  }
}
