import type { ForkEvent, Release } from '@ghostl/types/devops';

export interface ReleaseService {
  list(): Promise<Release[]>;
}

export interface ForkSchedulerService {
  list(): Promise<ForkEvent[]>;
  schedule(fork: ForkEvent): Promise<void>;
}

export interface UpgradeJobService {
  list(): Promise<{ id: string; target: string; status: 'planned' | 'running' | 'failed' | 'done'; startedAt?: string }[]>;
}

export interface RollbackService {
  list(): Promise<{ id: string; version: string; reason: string; time: string }[]>;
}
