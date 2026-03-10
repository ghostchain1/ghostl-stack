/**
 * Strategy Engine (Phase 51)
 *
 * Returns current system optimization targets derived from the live
 * STRATEGY config and optional GhostBrain advisory data.
 *
 * The strategy is informational — it guides human operators when
 * deciding whether to approve or reject a proposal.  The engine never
 * enforces targets autonomously.
 */

import { STRATEGY } from "../config/rules.js";

export interface StrategySnapshot {
  validatorTargetLoad:   number;   // % CPU target per validator
  treasuryYieldTarget:   number;   // annualised % (informational)
  nodeRedundancy:        number;   // minimum redundant nodes
  generatedAt:           string;   // ISO timestamp
  advice:                string[];
}

/**
 * Generate a current-cycle strategy snapshot.
 * The `advice` array provides human-readable context for the UI.
 */
export function strategy(
  metrics: {
    avgCpu?:        number;
    jailedCount?:   number;
    chainsOnline?:  number;
    totalTvlGST?:   number;
  } = {},
): StrategySnapshot {
  const advice: string[] = [];

  const { avgCpu = 0, jailedCount = 0, chainsOnline = 0, totalTvlGST = 0 } = metrics;

  if (avgCpu > STRATEGY.validatorTargetLoad) {
    advice.push(
      `Avg validator CPU (${avgCpu}%) exceeds target (${STRATEGY.validatorTargetLoad}%) — consider adding nodes.`,
    );
  }

  if (jailedCount > 0) {
    advice.push(
      `${jailedCount} validator(s) jailed — governance review required.`,
    );
  }

  if (chainsOnline < 3) {
    advice.push(
      `Only ${chainsOnline}/3 chain(s) reporting online — check L1/L2/L3 node health.`,
    );
  }

  if (totalTvlGST > 0 && totalTvlGST < 100) {
    advice.push(
      `Bridge TVL is low (${totalTvlGST.toFixed(1)} GST) — liquidity provision may be needed.`,
    );
  }

  if (advice.length === 0) {
    advice.push("All monitored subsystems are within target parameters.");
  }

  return {
    validatorTargetLoad: STRATEGY.validatorTargetLoad,
    treasuryYieldTarget: STRATEGY.treasuryYieldTarget,
    nodeRedundancy:      STRATEGY.nodeRedundancy,
    generatedAt:         new Date().toISOString(),
    advice,
  };
}
