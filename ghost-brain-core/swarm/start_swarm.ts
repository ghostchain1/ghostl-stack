/**
 * GhostBrain Swarm AI — Entry Point
 *
 * Wires all agents into a SwarmController and starts the swarm loop.
 *
 * Environment variables:
 *   GHOSTBRAIN_MEMORY_PATH   — path to the shared memory JSONL file
 *   SWARM_INTERVAL_MS        — tick interval (default 10 000 ms)
 *   SUPERVISOR_API_URL       — GhostBrain supervisor REST API
 *   GHOSTBRAIN_API_URL       — GhostBrain inference API
 *   GHOSTBRAIN_COMPILER_URL  — GhostTensor compiler daemon
 *   GHOSTBRAIN_MGMT_URL      — GhostBrain management API
 *   GHOSTCHAIN_L1_RPC        — GhostChain L1 JSON-RPC
 *   GHOSTL2_RPC              — GhostL2 JSON-RPC
 *   GHOSTL3_RPC              — GhostL3 JSON-RPC
 *   SWARM_DEBUG              — set to "1" for verbose tick logs
 *
 * This process shares the same JSONL memory file as the supervisor so both
 * systems read each other's persisted events without any network roundtrip.
 */

import { SwarmController } from "./coordination/swarm_controller.js";
import { AgentBus }        from "./messaging/agent_bus.js";

import { ArchitectAI }     from "./agents/architect_ai.js";
import { InfrastructureAI } from "./agents/infrastructure_ai.js";
import { SecurityAI }      from "./agents/security_ai.js";
import { CompilerAI }      from "./agents/compiler_ai.js";
import { NetworkAI }       from "./agents/network_ai.js";
import { TreasuryAI }      from "./agents/treasury_ai.js";

import type { ConsensusActionsPayload } from "./messaging/event_channel.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const swarm = new SwarmController(process.env["GHOSTBRAIN_MEMORY_PATH"]);

  // Register all agents.
  swarm
    .register(new ArchitectAI())
    .register(new InfrastructureAI())
    .register(new SecurityAI())
    .register(new CompilerAI())
    .register(new NetworkAI())
    .register(new TreasuryAI());

  // Subscribe to consensus output for logging (external consumers can
  // subscribe to this on their own AgentBus instance wired to the same bus).
  swarm.bus.subscribe("consensus:actions", (msg) => {
    const payload = msg.payload as ConsensusActionsPayload;
    if (payload.actionCount === 0) return;
    console.log(
      `[Swarm] tick=${payload.tick} consensus: ${payload.actionCount} action(s)`,
    );
    for (const action of payload.actions) {
      console.log(
        `  [${action.priority.toString().padStart(3)}] ${action.kind}` +
        (action.target ? ` → ${action.target}` : "") +
        ` (confidence=${action.confidence.toFixed(3)}, by=[${action.proposedBy.join(",")}])`,
      );
    }
  });

  // Log governance proposals to console (they are handled by each agent
  // internally — this subscriber is informational only).
  swarm.bus.subscribe("governance:propose", (msg) => {
    console.log(
      `[Swarm] governance:propose from=${msg.from}: ${msg.payload.description}`,
    );
  });

  // Start the swarm.
  await swarm.run();
}

main().catch(err => {
  console.error("[Swarm] Fatal error:", err);
  process.exit(1);
});
