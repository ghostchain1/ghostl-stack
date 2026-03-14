export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed';

export interface Proposal {
  id: string;
  title: string;
  status: ProposalStatus;
  quorum: number;
  votesFor: number;
  votesAgainst: number;
  createdAt?: string;
  closesAt?: string;
}

export interface Vote {
  proposalId: string;
  voter: string;
  weight: number;
  choice: 'for' | 'against' | 'abstain';
  time?: string;
}
