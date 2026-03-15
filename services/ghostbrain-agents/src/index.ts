/**
 * GhostBrain Agents — main entry point.
 */
import { AgentRegistry }    from "./AgentRegistry";
import { AgentCoordinator } from "./AgentCoordinator";
import { AgentMessenger }   from "./AgentMessenger";
import { decisionProtocol, consensusProtocol } from "../protocols/decision-protocol";
import {
  ArchitectAgent, DeveloperAgent, OperatorAgent,
  SecurityAgent, TreasuryAgent, MarketAgent, GovernorAgent,
} from "../agents/index";

// Bootstrap
const registry    = new AgentRegistry();
const coordinator = new AgentCoordinator(registry);
const messenger   = new AgentMessenger();
const governor    = new GovernorAgent();

registry.register(new ArchitectAgent());
registry.register(new DeveloperAgent());
registry.register(new OperatorAgent());
registry.register(new SecurityAgent());
registry.register(new TreasuryAgent());
registry.register(new MarketAgent());
registry.register(governor);

async function processEvent(type: string, data: Record<string, unknown> = {}): Promise<void> {
  console.log(`\n=== [GhostBrain Agents] Event: ${type} ===`);

  const responses = await coordinator.coordinate({ type, data });
  console.log(`[Agents] ${responses.length} agent(s) responded`);

  const decision = decisionProtocol(responses);
  if (!decision) {
    console.log("[Agents] No action required");
    return;
  }

  const votes = responses.map(() => decision.risk !== "HIGH" ? "approve" as const : "reject" as const);
  const passed = consensusProtocol(votes);

  if (!passed) {
    console.warn("[Agents] Consensus FAILED — action blocked");
    return;
  }

  const approved = governor.approve(decision);
  if (approved) {
    messenger.send("GovernorAgent", "system", "execute", { action: decision.action });
    console.log(`[Agents] Executing: ${decision.action}`);
  }
}

// Example: process a test event if run directly
if (require.main === module) {
  processEvent("node_failure", { nodeId: "ghost-l1-validator-03" })
    .catch(console.error);
}

export { processEvent, registry, coordinator, messenger };
