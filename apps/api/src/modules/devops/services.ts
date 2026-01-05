import type { ForkEvent, Release } from '../../../../../packages/types';

export interface ReleaseService {
  list(): Promise<Release[]>;
  plan(release: Omit<Release, 'status'>): Promise<Release>;
  start(version: string): Promise<Release>;
  complete(version: string): Promise<Release>;
}

export interface ForkSchedulerService {
  list(): Promise<ForkEvent[]>;
  schedule(event: ForkEvent): Promise<ForkEvent>;
}

export interface UpgradeJobService {
  list(): Promise<{ id: string; status: string; targetVersion: string }[]>;
  trigger(targetVersion: string): Promise<{ id: string }>;
  status(id: string): Promise<{ id: string; status: string }>;
}

export interface RollbackService {
  list(): Promise<{ id: string; fromVersion: string; toVersion: string; createdAt: string }[]>;
  rollback(target: string): Promise<{ id: string }>;
}
