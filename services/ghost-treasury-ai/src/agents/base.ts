/**
 * agents/base.ts — Abstract base class for all GhostTreasuryAI swarm agents.
 *
 * Each agent:
 *   1. Receives an AgentContext (snapshot + metadata)
 *   2. Runs its specialized reasoning logic
 *   3. Returns an AgentVote
 *
 * Agents never interact with on-chain contracts directly; they only
 * return recommendations. The ProposalBuilder assembles the final
 * ProposalIntent from the quorum of votes.
 */

import type { AgentContext, AgentVote } from './types.js';
import { agentCycles, agentVotes, agentLatency } from '../metrics.js';
import { logger } from '../logger.js';

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly description: string;

  /**
   * Run one reasoning cycle. Subclasses implement this.
   * Must not throw — return 'abstain' on error.
   */
  protected abstract reason(ctx: AgentContext): Promise<AgentVote>;

  /** Public entry point. Wraps reason() with metrics + error handling. */
  async vote(ctx: AgentContext): Promise<AgentVote> {
    const timer = agentLatency.startTimer({ agent: this.id });
    try {
      const result = await this.reason(ctx);
      agentCycles.inc({ agent: this.id });
      agentVotes.inc({ agent: this.id, verdict: result.verdict });
      return result;
    } catch (err) {
      logger.error(`${this.id}: reasoning error`, {
        error:   String(err),
        cycleId: ctx.cycleId,
      });
      agentVotes.inc({ agent: this.id, verdict: 'abstain' });
      return {
        agentId:    this.id,
        verdict:    'abstain',
        confidence: 0,
        rationale:  `Internal error: ${String(err)}`,
      };
    } finally {
      timer();
    }
  }
}
