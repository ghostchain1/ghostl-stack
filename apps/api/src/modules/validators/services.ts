import type { SlashEvent, Validator } from '../../../../../packages/types';

export interface ValidatorService {
  list(status?: Validator['status']): Promise<Validator[]>;
  get(id: string): Promise<Validator | null>;
  setStatus(id: string, status: Validator['status']): Promise<Validator>;
}

export interface StakingService {
  delegate(validatorId: string, amount: string): Promise<void>;
  undelegate(validatorId: string, amount: string): Promise<void>;
}

export interface RewardsService {
  getRewards(validatorId: string): Promise<{ total: string; latest: string }>;
  payout(validatorId: string): Promise<void>;
}

export interface ParticipationService {
  getParticipation(): Promise<{ validatorId: string; missedBlocks: number; participation: number }[]>;
  getSlashEvents(validatorId?: string): Promise<SlashEvent[]>;
}
