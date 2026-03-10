/**
 * GhostBrain Swarm AI — Consensus Engine
 *
 * Aggregates AgentReport recommendations from all agents each tick and
 * produces a ranked list of ConsensusActions. Actions proposed by multiple
 * agents are merged and their confidence is boosted by agreement count.
 *
 * Decision rules:
 *   - Dedup key: `kind + (target ?? "")` — multiple agents recommending the
 *     same action on the same target are merged.
 *   - Merged confidence = 1 − ∏(1 − cᵢ) (probabilistic OR combination).
 *   - Merged priority = max(priorityᵢ).
 *   - Output is sorted by priority desc, then confidence desc.
 *   - Hard cap: at most MAX_CONSENSUS_ACTIONS actions per tick.
 *   - An action must meet MIN_CONFIDENCE to appear in the output.
 *
 * The ConsensusEngine is read-only — it does not trigger any side effects.
 * The SwarmController passes the result to agents and the supervisor API.
 */

import type { AgentReport, AgentRecommendation } from "./agent_interface.js";
import type { ConsensusAction, ConsensusActionsPayload } from "../messaging/event_channel.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONSENSUS_ACTIONS = parseInt(
  process.env["SWARM_MAX_CONSENSUS_ACTIONS"] ?? "10", 10,
);

const MIN_CONFIDENCE = parseFloat(
  process.env["SWARM_MIN_CONFIDENCE"] ?? "0.3",
);

// ---------------------------------------------------------------------------
// ConsensusEngine
// ---------------------------------------------------------------------------

export class ConsensusEngine {
  /**
   * Merge reports from all agents into a ranked consensus action list.
   * Returns a ConsensusActionsPayload ready for publication on the bus.
   */
  merge(tick: number, reports: AgentReport[]): ConsensusActionsPayload {
    const map = new Map<string, MergeAccumulator>();

    for (const report of reports) {
      if (!report.healthy) continue;   // Unhealthy agent votes are excluded.
      for (const rec of report.recommendations) {
        this.accumulate(map, report.agentName, rec);
      }
    }

    const actions: ConsensusAction[] = Array.from(map.values())
      .map(acc => this.finalise(acc))
      .filter(a => a.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence)
      .slice(0, MAX_CONSENSUS_ACTIONS);

    return {
      tick,
      agentCount:  reports.length,
      actionCount: actions.length,
      actions,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private accumulate(
    map:       Map<string, MergeAccumulator>,
    agentName: string,
    rec:       AgentRecommendation,
  ): void {
    const key = `${rec.kind}::${rec.target ?? ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        kind:         rec.kind,
        target:       rec.target,
        confidences:  [rec.confidence],
        maxPriority:  rec.priority,
        proposedBy:   [agentName],
        description:  rec.description,
      });
    } else {
      existing.confidences.push(rec.confidence);
      existing.maxPriority = Math.max(existing.maxPriority, rec.priority);
      existing.proposedBy.push(agentName);
      // Keep the highest-priority description (first proposer in tie).
      if (rec.priority > existing.maxPriority) {
        existing.description = rec.description;
      }
    }
  }

  /**
   * Finalise an accumulated entry into a ConsensusAction.
   * Uses probabilistic OR to combine independent confidence estimates:
   *   P(at least one is correct) = 1 − ∏(1 − cᵢ)
   */
  private finalise(acc: MergeAccumulator): ConsensusAction {
    const combined = 1 - acc.confidences.reduce((prod, c) => prod * (1 - c), 1);
    return {
      kind:        acc.kind,
      target:      acc.target,
      confidence:  Math.round(Math.min(combined, 1.0) * 1000) / 1000,
      priority:    acc.maxPriority,
      proposedBy:  [...new Set(acc.proposedBy)],
      description: acc.description,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal accumulator (not exported)
// ---------------------------------------------------------------------------

interface MergeAccumulator {
  kind:        string;
  target?:     string;
  confidences: number[];
  maxPriority: number;
  proposedBy:  string[];
  description: string;
}
