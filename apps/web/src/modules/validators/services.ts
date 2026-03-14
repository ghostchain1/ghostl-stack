import type { SlashEvent, Validator } from '@ghostl/types/validators';

export interface ValidatorService {
  list(): Promise<Validator[]>;
  get(id: string): Promise<Validator | null>;
}

export interface StakingService {
  delegate(validatorId: string, amount: string): Promise<void>;
  undelegate(validatorId: string, amount: string): Promise<void>;
}

export interface RewardsService {
  getRewards(validatorId: string): Promise<string>;
}

export interface ParticipationService {
  getParticipation(): Promise<{ finality?: string; participation?: string; proposer?: string }>;
  getMissedBlocks(validatorId: string): Promise<number>;
  getSlashEvents(validatorId: string): Promise<SlashEvent[]>;
}
