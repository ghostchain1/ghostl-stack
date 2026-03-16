import type { Proposal, Vote } from '@ghostchain/types/governance';

export interface GovernanceService {
  listProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | null>;
}

export interface VotingAnalyticsService {
  listVotes(proposalId: string): Promise<Vote[]>;
}

export interface ExecutionQueueService {
  list(): Promise<{ id: string; eta: string; action: string; status: 'queued' | 'executed' | 'canceled' }[]>;
}
