/**
 * votingAnalyzer.ts — Governance voting intelligence
 *
 * Predicts voting outcomes, tracks participation, and produces
 * voting analytics for the governance dashboard.  Actual on-chain
 * votes are external; this module manages simulated / projected votes
 * and tracks participation from registered DAO members.
 */

import logger from "../utils/logger";
import type { GovernanceProposal } from "../proposals/proposalGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoterProfile {
  address:      string;
  votingPower:  number;   // normalised 0-∞
  historicalYesPct: number; // 0-1
  isValidator:  boolean;
}

export interface VotingPrediction {
  proposalId:       string;
  timestamp:        number;
  totalVoters:      number;
  projectedYes:     number;   // count
  projectedNo:      number;
  projectedAbstain: number;
  projectedYesPct:  number;   // 0-1
  weightedYesPct:   number;   // weighted by voting power
  quorumExpected:   boolean;
  likelyOutcome:    "pass" | "fail" | "uncertain";
  confidenceScore:  number;
  keyDrivers:       string[];
}

export interface VotingResult {
  proposalId:   string;
  finalYes:     number;
  finalNo:      number;
  finalAbstain: number;
  quorumMet:    boolean;
  passed:       boolean;
  closedAt:     number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUORUM_THRESHOLD  = 0.20; // 20% of registered voters must participate
const PASS_THRESHOLD    = 0.51; // simple majority
const VALIDATOR_WEIGHT  = 2.5;  // validators have 2.5× voting power multiplier

// ── Voter registry (synthetic bootstrap population) ───────────────────────────

const voterPool: VoterProfile[] = [];
const votingResults = new Map<string, VotingResult>();
const predictions   = new Map<string, VotingPrediction>();

function bootstrapVoters(): void {
  if (voterPool.length > 0) return;

  // Synthetic voter pool: 250 wallets with varied voting power
  for (let i = 0; i < 250; i++) {
    const isValidator = i < 30; // first 30 are validators
    voterPool.push({
      address:         `0x${i.toString(16).padStart(40, "0")}`,
      votingPower:     isValidator ? 2.5 + Math.random() * 5 : 0.5 + Math.random() * 2,
      historicalYesPct: 0.45 + Math.random() * 0.35,  // 45-80% historical yes rate
      isValidator,
    });
  }
  logger.info(`[VotingAnalyzer] Bootstrapped ${voterPool.length} voter profiles`);
}

// ── Prediction engine ─────────────────────────────────────────────────────────

export function predictVote(proposal: GovernanceProposal): VotingPrediction {
  bootstrapVoters();

  const totalVoters   = voterPool.length;
  const participation = 0.35 + proposal.aiConfidence * 0.25; // higher confidence → more participation

  const participating = voterPool.filter(() => Math.random() < participation);

  let yesWeight = 0, noWeight = 0, abstainWeight = 0;
  let yesCount  = 0, noCount  = 0, abstainCount  = 0;

  for (const voter of participating) {
    const weight = voter.isValidator ? voter.votingPower * VALIDATOR_WEIGHT : voter.votingPower;
    const bias   = voter.historicalYesPct * proposal.aiConfidence;
    const roll   = Math.random();

    if (roll < bias) {
      yesWeight  += weight; yesCount++;
    } else if (roll < bias + 0.15) {
      abstainWeight += weight; abstainCount++;
    } else {
      noWeight   += weight; noCount++;
    }
  }

  const totalWeight      = yesWeight + noWeight + abstainWeight || 1;
  const weightedYesPct   = yesWeight / totalWeight;
  const projectedYesPct  = yesCount  / (yesCount + noCount + abstainCount || 1);
  const quorumExpected   = participating.length / totalVoters >= QUORUM_THRESHOLD;
  const likelyOutcome: VotingPrediction["likelyOutcome"] =
    !quorumExpected                    ? "uncertain" :
    weightedYesPct >= PASS_THRESHOLD   ? "pass"      :
    weightedYesPct < 0.4               ? "fail"      :
    "uncertain";

  const keyDrivers: string[] = [];
  if (weightedYesPct > 0.65) keyDrivers.push("Strong validator support");
  if (proposal.aiConfidence > 0.75) keyDrivers.push("High AI confidence in proposal quality");
  if (participation > 0.5) keyDrivers.push("High expected participation");
  if (proposal.category === "security") keyDrivers.push("Security proposals typically receive broad support");
  if (proposal.category === "tokenomics") keyDrivers.push("Tokenomics changes attract engaged token holders");

  const pred: VotingPrediction = {
    proposalId:      proposal.id,
    timestamp:       Date.now(),
    totalVoters,
    projectedYes:    yesCount,
    projectedNo:     noCount,
    projectedAbstain: abstainCount,
    projectedYesPct,
    weightedYesPct,
    quorumExpected,
    likelyOutcome,
    confidenceScore: proposal.aiConfidence,
    keyDrivers,
  };

  predictions.set(proposal.id, pred);
  logger.info(`[VotingAnalyzer] Predicted "${proposal.title}" → ${likelyOutcome} (weighted-yes=${(weightedYesPct * 100).toFixed(1)}%)`);
  return pred;
}

// ── Result recording (called after actual vote concludes) ─────────────────────

export function recordVotingResult(
  proposalId: string,
  yes: number,
  no:  number,
  abstain = 0,
): VotingResult {
  bootstrapVoters();
  const total   = yes + no + abstain;
  const quorum  = total / voterPool.length >= QUORUM_THRESHOLD;
  const passed  = quorum && yes / (yes + no || 1) > PASS_THRESHOLD;

  const result: VotingResult = {
    proposalId, finalYes: yes, finalNo: no,
    finalAbstain: abstain, quorumMet: quorum, passed, closedAt: Date.now(),
  };

  votingResults.set(proposalId, result);
  logger.info(`[VotingAnalyzer] Recorded result for ${proposalId}: passed=${passed}`);
  return result;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getPrediction(proposalId: string):  VotingPrediction | undefined { return predictions.get(proposalId); }
export function getAllPredictions():                 VotingPrediction[] { return [...predictions.values()]; }
export function getVotingResult(proposalId: string): VotingResult | undefined    { return votingResults.get(proposalId); }
export function getParticipantCount():               number { bootstrapVoters(); return voterPool.length; }

export function getVotingStats() {
  const preds  = [...predictions.values()];
  const results= [...votingResults.values()];
  return {
    registeredVoters: voterPool.length,
    predictionsRun:   preds.length,
    resultsRecorded:  results.length,
    likelyPass:   preds.filter((p) => p.likelyOutcome === "pass").length,
    likelyFail:   preds.filter((p) => p.likelyOutcome === "fail").length,
    uncertain:    preds.filter((p) => p.likelyOutcome === "uncertain").length,
    actualPassed: results.filter((r) => r.passed).length,
    avgWeightedYesPct: preds.length
      ? preds.reduce((s, p) => s + p.weightedYesPct, 0) / preds.length
      : 0,
  };
}
