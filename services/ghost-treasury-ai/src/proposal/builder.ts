/**
 * proposal/builder.ts — Assembles a ProposalIntent from agent votes.
 *
 * Quorum rules:
 *   • If RiskGovernor rejects with confidence ≥ 0.7 → BLOCKED (veto power)
 *   • If MarketSentinel rejects with confidence ≥ 0.7 → BLOCKED (veto power)
 *   • Otherwise: simple weighted majority of approvals by confidence score
 *   • Minimum 2 'approve' votes needed to proceed
 *
 * This is a strict constitution: consensus + two vetoes.
 */

import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import type { AgentVote, MarketSnapshot, ProposalIntent } from '../agents/types.js';
import { OperationLayer } from '../agents/types.js';
import { logger } from '../logger.js';

/** Agents with unconditional veto power (by agent id). */
const VETO_AGENTS = new Set(['risk-governor', 'market-sentinel']);
/** Minimum veto confidence to actually block. */
const VETO_THRESHOLD = 0.7;
/** Minimum number of 'approve' votes for a proposal to proceed. */
const MIN_APPROVALS = 2;

export interface VoteResult {
  quorumMet:    boolean;
  blocked:      boolean;
  blockedBy?:   string;
  approvals:    number;
  confidence:   number;
  summary:      string;
}

export function evaluateVotes(votes: AgentVote[]): VoteResult {
  // Check vetoes first
  for (const vote of votes) {
    if (
      VETO_AGENTS.has(vote.agentId) &&
      vote.verdict === 'reject' &&
      vote.confidence >= VETO_THRESHOLD
    ) {
      return {
        quorumMet:  false,
        blocked:    true,
        blockedBy:  vote.agentId,
        approvals:  0,
        confidence: 0,
        summary:    `BLOCKED by ${vote.agentId} (confidence ${(vote.confidence * 100).toFixed(0)}%): ${vote.rationale}`,
      };
    }
  }

  // Count weighted approvals
  const approvals = votes.filter(v => v.verdict === 'approve');
  const weightedConfidence = approvals.length > 0
    ? approvals.reduce((sum, v) => sum + v.confidence, 0) / approvals.length
    : 0;

  const quorumMet = approvals.length >= MIN_APPROVALS && weightedConfidence >= 0.6;

  return {
    quorumMet,
    blocked:    false,
    approvals:  approvals.length,
    confidence: weightedConfidence,
    summary:    quorumMet
      ? `Quorum met: ${approvals.length} approvals, avg confidence ${(weightedConfidence * 100).toFixed(1)}%`
      : `Quorum not met: ${approvals.length}/${MIN_APPROVALS} needed`,
  };
}

export function buildProposalIntent(
  snapshot:    MarketSnapshot,
  votes:       AgentVote[],
  strategyId:  number,
  token:       string,
  target:      string,
  amountEth:   bigint,
  shadowOnly:  boolean,
): ProposalIntent {
  const result = evaluateVotes(votes);

  if (!result.quorumMet || result.blocked) {
    logger.info('proposal blocked or quorum not met', {
      blocked:  result.blocked,
      blockedBy: result.blockedBy,
      approvals: result.approvals,
      summary:   result.summary,
    });
    throw new Error(`Proposal blocked: ${result.summary}`);
  }

  // Estimate NAV and stable reserve after execution
  const estNAVAfterEth    = snapshot.navEth;   // conservative: no uplift assumption
  const estStableAfterEth = snapshot.stableReserveEth > amountEth
    ? snapshot.stableReserveEth - amountEth
    : 0n;

  // Build originator hash: keccak of (cycleTime, votes digest, snapshot hash)
  const votesSummary = votes.map(v => `${v.agentId}:${v.verdict}:${v.confidence.toFixed(2)}`).join(',');
  const originatorHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${snapshot.timestamp}|${votesSummary}`),
  );

  return {
    id:               uuidv4(),
    originatorHash:   originatorHash.slice(0, 66),  // bytes32 hex
    strategyId,
    token,
    target,
    amountEth,
    callData:         '0x',
    layer:            OperationLayer.L1,
    estNAVAfterEth,
    estStableAfterEth,
    estAssetAlloc:    amountEth,
    rationale:        result.summary,
    votes,
    shadowOnly,
  };
}
