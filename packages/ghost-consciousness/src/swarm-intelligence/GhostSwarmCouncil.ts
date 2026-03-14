import { GhostSwarmMediator } from './GhostSwarmMediator.js';
import type { SwarmAgent, SwarmIssue, SwarmDeliberation, SwarmVote } from '../types.js';

/**
 * GhostSwarmCouncil — multi-swarm deliberation chamber.
 *
 * Maintains a registry of all active swarm agents across the GhostStack
 * ecosystem. When an issue is raised (by the ConsciousnessCore or external
 * trigger), every registered agent votes on it and the mediator resolves the
 * result. The Council is the democratic veto mechanism that prevents the
 * GlobalCoordinator from acting unilaterally on high-consequence decisions.
 *
 * Quorum: at least 1 agent must be registered and at least 50% + 1 must vote
 * 'yes' for the issue to pass (simple majority, configurable).
 */
export class GhostSwarmCouncil {
  private readonly swarms: SwarmAgent[] = [];
  private readonly mediator = new GhostSwarmMediator();
  private readonly deliberationLog: SwarmDeliberation[] = [];

  /** Register a swarm agent with the council. */
  register(agent: SwarmAgent): void {
    if (!this.swarms.find((a) => a.id === agent.id)) {
      this.swarms.push(agent);
    }
  }

  /** Deregister an agent (e.g. when it goes offline). */
  deregister(agentId: string): void {
    const idx = this.swarms.findIndex((a) => a.id === agentId);
    if (idx !== -1) this.swarms.splice(idx, 1);
  }

  /**
   * Raise an issue for deliberation.
   * If no agents are registered, the issue fails by default (no quorum).
   */
  deliberate(issue: SwarmIssue): SwarmDeliberation {
    if (this.swarms.length === 0) {
      const deliberation: SwarmDeliberation = {
        issue,
        votes: [],
        outcome: false,
        consensus: 0,
        timestamp: Date.now(),
      };
      this.deliberationLog.push(deliberation);
      return deliberation;
    }

    const votes: SwarmVote[] = this.swarms.map((agent) => agent.vote(issue));
    const result = this.mediator.resolve(votes);

    const deliberation: SwarmDeliberation = {
      issue,
      votes,
      outcome: result.outcome,
      consensus: result.consensus,
      timestamp: Date.now(),
    };

    this.deliberationLog.push(deliberation);
    return deliberation;
  }

  /**
   * Poll all agents on multiple issues simultaneously.
   * Returns an array of deliberation results in the same order as the issues.
   */
  deliberateAll(issues: SwarmIssue[]): SwarmDeliberation[] {
    return issues.map((issue) => this.deliberate(issue));
  }

  /** Returns the current roster of registered swarm agents. */
  get roster(): Readonly<SwarmAgent[]> {
    return this.swarms;
  }

  /** Returns all past deliberations. */
  get history(): Readonly<SwarmDeliberation[]> {
    return this.deliberationLog;
  }

  /** Returns the most recent deliberation, if any. */
  get lastDeliberation(): SwarmDeliberation | undefined {
    return this.deliberationLog.at(-1);
  }

  /** Council size (number of registered agents). */
  get size(): number {
    return this.swarms.length;
  }
}
