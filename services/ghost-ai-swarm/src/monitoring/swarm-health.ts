/**
 * Swarm Health Monitor
 * Collects descriptor data from all agents and computes an aggregate health score.
 */
import { builderDescriptor }    from "../agents/builder-agent";
import { auditorDescriptor }    from "../agents/auditor-agent";
import { defenderDescriptor }   from "../agents/defender-agent";
import { optimizerDescriptor }  from "../agents/optimizer-agent";
import { infraDescriptor }      from "../agents/infra-agent";
import { governanceDescriptor } from "../agents/governance-agent";
import { treasuryDescriptor }   from "../agents/treasury-agent";
import { swarmBus }             from "../communication/swarm-bus";
import { SWARM_HEALTH_SCORE }   from "../metrics";
import type { AgentDescriptor } from "../types";

export interface SwarmHealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  healthScore: number;
  agents: AgentDescriptor[];
  busHistory: ReturnType<typeof swarmBus.getHistory>;
  ts: string;
}

export function swarmHealth(): SwarmHealthReport {
  const agents: AgentDescriptor[] = [
    builderDescriptor(),
    auditorDescriptor(),
    defenderDescriptor(),
    optimizerDescriptor(),
    infraDescriptor(),
    governanceDescriptor(),
    treasuryDescriptor(),
  ];

  const degraded = agents.filter(a => a.status === "degraded").length;
  const errored  = agents.filter(a => a.status === "error").length;

  // Compute health score: each degraded agent costs 10 pts; each error costs 20pts
  const rawScore = 100 - degraded * 10 - errored * 20;
  const score = Math.max(0, Math.min(100, rawScore));
  SWARM_HEALTH_SCORE.set(score);

  const status =
    score === 100 ? "healthy" :
    score >= 50   ? "degraded" :
    "unhealthy";

  return {
    status,
    healthScore: score,
    agents,
    busHistory: swarmBus.getHistory(10),
    ts: new Date().toISOString(),
  };
}
