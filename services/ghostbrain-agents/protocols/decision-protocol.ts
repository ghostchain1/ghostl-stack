/**
 * Decision and Consensus protocols for the GhostBrain Agent Network.
 */
import { GhostAgentResponse } from "../src/AgentRegistry";

/** Selects the action with lowest risk from agent proposals. */
export function decisionProtocol(responses: GhostAgentResponse[]): GhostAgentResponse | null {
  if (responses.length === 0) return null;

  const order: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return responses.sort((a, b) => order[a.risk] - order[b.risk])[0];
}

/** Returns true if majority of agents approve an action. */
export function consensusProtocol(
  votes: Array<"approve" | "reject">
): boolean {
  const approvals = votes.filter(v => v === "approve").length;
  return approvals > votes.length / 2;
}
