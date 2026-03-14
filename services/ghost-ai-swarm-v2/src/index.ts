/**
 * GhostStack AI Swarm v2 — Entry Point
 * Starts all 15 AI agents, the GhostBrain Message Bus, and the Fastify HTTP server.
 */

import { buildApp }           from "./app.js";
import { SwarmOrchestrator }  from "./orchestrator.js";
import type { BaseAgent }     from "./agents/base.js";
import type { AgentRole }     from "./types.js";

// Import all 15 agents
import { GhostArchitectAgent  } from "./agents/architect.js";
import { GhostExecutorAgent   } from "./agents/executor.js";
import { GhostAuditorAgent    } from "./agents/auditor.js";
import { GhostGovernorAgent   } from "./agents/governor.js";
import { GhostInfraAgent      } from "./agents/infra.js";
import { GhostNetworkAgent    } from "./agents/network.js";
import { GhostNodeAgent       } from "./agents/node.js";
import { GhostContractAgent   } from "./agents/contract.js";
import { GhostTreasuryAgent   } from "./agents/treasury.js";
import { GhostMarketAgent     } from "./agents/market.js";
import { GhostSwapAgent       } from "./agents/dex.js";
import { GhostLendAgent       } from "./agents/lend.js";
import { GhostSecurityAgent   } from "./agents/security.js";
import { GhostFraudAgent      } from "./agents/fraud.js";
import { GhostDaoAgent        } from "./agents/dao.js";

const PORT = Number(process.env["SWARM_V2_PORT"] ?? 7970);
const HOST = process.env["SWARM_V2_HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  // 1. Initialise all 15 agents
  const agents: BaseAgent[] = [
    new GhostArchitectAgent(),
    new GhostExecutorAgent(),
    new GhostAuditorAgent(),
    new GhostGovernorAgent(),
    new GhostInfraAgent(),
    new GhostNetworkAgent(),
    new GhostNodeAgent(),
    new GhostContractAgent(),
    new GhostTreasuryAgent(),
    new GhostMarketAgent(),
    new GhostSwapAgent(),
    new GhostLendAgent(),
    new GhostSecurityAgent(),
    new GhostFraudAgent(),
    new GhostDaoAgent(),
  ];

  // 2. Build role → agent registry
  const registry = new Map<AgentRole, BaseAgent>(
    agents.map(a => [a.role, a])
  );

  // 3. Announce all agents on the message bus
  for (const agent of agents) agent.announce();

  console.log(`[swarm-v2] ${agents.length} agents online:`, agents.map(a => a.role).join(", "));

  // 4. Instantiate orchestrator
  const orchestrator = new SwarmOrchestrator(registry);

  // 5. Build and start Fastify app
  const app = buildApp(registry, orchestrator);

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[swarm-v2] Listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 6. Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("[swarm-v2] Shutting down...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT",  shutdown);
}

main().catch(err => {
  console.error("[swarm-v2] Fatal:", err);
  process.exit(1);
});
