/**
 * Creator DAO — SQLite-backed off-chain proposal and vote tracking.
 * Mirrors the on-chain CreatorDAO.sol state for fast reads with eventual consistency.
 */

import { getDb } from '../backend/src/db/index.js';
import { hasGovPower } from './fan_rewards.js';

export interface DAOProposal {
  id: string;
  token_id: string;
  creator_id: string;
  proposer_id: string;
  description: string;
  votes_for: number;
  votes_against: number;
  ends_at: string;
  executed: number;   // 0 | 1
  chain_proposal_id: string | null;
  created_at: string;
}

export interface DAOVote {
  id: string;
  proposal_id: string;
  voter_id: string;
  support: number;   // 1 = for, 0 = against
  weight: number;    // fan-token holding at vote time
  tx_hash: string | null;
  voted_at: string;
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export function createProposal(params: {
  id: string;
  tokenId: string;
  creatorId: string;
  proposerId: string;
  description: string;
  endsAt: string;
  chainProposalId?: string;
}): DAOProposal {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO dao_proposals
       (id, token_id, creator_id, proposer_id, description, votes_for, votes_against,
        ends_at, executed, chain_proposal_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?)`,
  ).run(
    params.id,
    params.tokenId,
    params.creatorId,
    params.proposerId,
    params.description,
    params.endsAt,
    params.chainProposalId ?? null,
    now,
  );
  return getProposalById(params.id)!;
}

export function getProposalById(id: string): DAOProposal | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM dao_proposals WHERE id=?').get(id) as DAOProposal) ?? null;
}

export function listProposalsByToken(tokenId: string): DAOProposal[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM dao_proposals WHERE token_id=? ORDER BY created_at DESC')
    .all(tokenId) as DAOProposal[];
}

export function listActiveProposals(tokenId: string): DAOProposal[] {
  const db = getDb();
  const now = new Date().toISOString();
  return db
    .prepare('SELECT * FROM dao_proposals WHERE token_id=? AND ends_at>? AND executed=0 ORDER BY ends_at ASC')
    .all(tokenId, now) as DAOProposal[];
}

export function markExecuted(proposalId: string): void {
  const db = getDb();
  db.prepare('UPDATE dao_proposals SET executed=1 WHERE id=?').run(proposalId);
}

// ── Voting ────────────────────────────────────────────────────────────────────

export interface CastVoteResult {
  success: boolean;
  error?: string;
  vote?: DAOVote;
}

/** Cast a vote on a proposal.  Enforces: voting window open, one-vote-per-user, gov power check. */
export function castVote(params: {
  voteId: string;
  proposalId: string;
  voterId: string;
  support: boolean;
  weight: number;
  txHash?: string;
}): CastVoteResult {
  const db = getDb();
  const proposal = getProposalById(params.proposalId);
  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (new Date(proposal.ends_at) <= new Date()) return { success: false, error: 'Voting window closed' };

  const existing = db
    .prepare('SELECT id FROM dao_votes WHERE proposal_id=? AND voter_id=?')
    .get(params.proposalId, params.voterId);
  if (existing) return { success: false, error: 'Already voted' };

  if (!hasGovPower(params.voterId, proposal.token_id)) {
    return { success: false, error: 'Insufficient fan token holdings for governance' };
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO dao_votes (id, proposal_id, voter_id, support, weight, tx_hash, voted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.voteId, params.proposalId, params.voterId, params.support ? 1 : 0, params.weight, params.txHash ?? null, now);

  if (params.support) {
    db.prepare('UPDATE dao_proposals SET votes_for = votes_for + ? WHERE id=?').run(params.weight, params.proposalId);
  } else {
    db.prepare('UPDATE dao_proposals SET votes_against = votes_against + ? WHERE id=?').run(params.weight, params.proposalId);
  }

  const vote = db.prepare('SELECT * FROM dao_votes WHERE id=?').get(params.voteId) as DAOVote;
  return { success: true, vote };
}

export function getVoteByUser(proposalId: string, voterId: string): DAOVote | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM dao_votes WHERE proposal_id=? AND voter_id=?').get(proposalId, voterId) as DAOVote) ?? null;
}

export function listVotesByProposal(proposalId: string): DAOVote[] {
  const db = getDb();
  return db.prepare('SELECT * FROM dao_votes WHERE proposal_id=? ORDER BY voted_at DESC').all(proposalId) as DAOVote[];
}
