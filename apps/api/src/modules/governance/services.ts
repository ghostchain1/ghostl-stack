import type { Proposal } from '../../../../../packages/types';

export interface GovernanceService {
  list(): Promise<Proposal[]>;
  get(id: string): Promise<Proposal | null>;
  create(proposal: Omit<Proposal, 'id' | 'status' | 'votesFor' | 'votesAgainst'>): Promise<Proposal>;
  updateStatus(id: string, status: Proposal['status']): Promise<Proposal>;
}

export interface VotingAnalyticsService {
  getQuorumStatus(id: string): Promise<{ quorum: number; participation: number }>;
  getDelegations(): Promise<{ delegator: string; delegate: string; weight: number }[]>;
}

export interface ExecutionQueueService {
  list(): Promise<{ id: string; proposalId: string; eta: string; status: string }[]>;
  enqueue(proposalId: string, eta: string): Promise<void>;
  execute(id: string): Promise<void>;
}
