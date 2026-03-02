/**
 * agents/post-trade-auditor.ts — Post-trade analysis and anomaly detection agent.
 *
 * Runs after each executed proposal to score the outcome:
 *   • Realised PnL vs expected PnL
 *   • Slippage vs estimated
 *   • Strategy rating update
 *   • Anomaly detection (unexpected outcomes → flag for human review)
 *   • Evidence pack generation for governance logs
 *
 * Does not vote on new proposals; returns audit reports for the
 * evolution-manager to update strategy scores.
 */

import { BaseAgent } from './base.js';
import type { AgentContext, AgentVote } from './types.js';

export interface AuditReport {
  proposalId:    number;
  strategyId:    number;
  realisedPnL:   bigint;  // wei, signed
  expectedPnL:   bigint;
  slippageBps:   number;
  anomalyScore:  number;  // 0-1
  anomalyFlags:  string[];
  rating:        'green' | 'yellow' | 'red';
  evidence:      Record<string, unknown>;
}

/** Slippage above this triggers a yellow flag. */
const SLIPPAGE_WARN_BPS   = 200;
/** Slippage above this triggers a red flag + quarantine signal. */
const SLIPPAGE_ALERT_BPS  = 500;

export class PostTradeAuditor extends BaseAgent {
  readonly id = 'post-trade-auditor';
  readonly description = 'Post-execution analysis, anomaly detection, and evidence packs';

  private readonly reports: AuditReport[] = [];

  protected async reason(ctx: AgentContext): Promise<AgentVote> {
    // During a normal cycle this agent abstains from proposal votes.
    // Its reports are generated separately via auditExecution().
    return {
      agentId:    this.id,
      verdict:    'abstain',
      confidence: 0.5,
      rationale:  'PostTradeAuditor is observational only. Audit reports generated via auditExecution().',
    };
  }

  /** Called by the orchestrator after a confirmed on-chain execution. */
  auditExecution(
    proposalId:    number,
    strategyId:    number,
    realisedPnL:   bigint,
    expectedPnL:   bigint,
    actualAmount:  bigint,
    expectedAmount:bigint,
  ): AuditReport {
    const flags: string[] = [];

    const slippageBps = expectedAmount > 0n
      ? Number(((expectedAmount - actualAmount < 0n ? actualAmount - expectedAmount : expectedAmount - actualAmount) * 10_000n) / expectedAmount)
      : 0;

    if (slippageBps > SLIPPAGE_ALERT_BPS) {
      flags.push(`CRITICAL: Slippage ${slippageBps / 100}% exceeds ${SLIPPAGE_ALERT_BPS / 100}% alert threshold`);
    } else if (slippageBps > SLIPPAGE_WARN_BPS) {
      flags.push(`WARNING: Slippage ${slippageBps / 100}% exceeds ${SLIPPAGE_WARN_BPS / 100}% warning threshold`);
    }

    const pnlDeviation = realisedPnL - expectedPnL;
    if (pnlDeviation < -(expectedPnL / 5n) && expectedPnL !== 0n) {
      flags.push(`PnL deviation: realised ${realisedPnL} vs expected ${expectedPnL} (>${20}% miss)`);
    }

    const anomalyScore = Math.min(1, (slippageBps / SLIPPAGE_ALERT_BPS) * 0.5 + (flags.length / 3) * 0.5);
    const rating: AuditReport['rating'] = anomalyScore > 0.7 ? 'red' : anomalyScore > 0.3 ? 'yellow' : 'green';

    const report: AuditReport = {
      proposalId,
      strategyId,
      realisedPnL,
      expectedPnL,
      slippageBps,
      anomalyScore,
      anomalyFlags: flags,
      rating,
      evidence: {
        actualAmount:   actualAmount.toString(),
        expectedAmount: expectedAmount.toString(),
        pnlDeviation:   pnlDeviation.toString(),
      },
    };

    this.reports.push(report);
    return report;
  }

  latestReports(n = 10): AuditReport[] {
    return this.reports.slice(-n);
  }
}
