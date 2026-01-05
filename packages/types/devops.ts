export type ReleaseStatus = 'planned' | 'running' | 'rolled_back' | 'completed';

export interface Release {
  version: string;
  components: string[];
  status: ReleaseStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface ForkEvent {
  name: string;
  activationHeight: number;
  checklist: string[];
}
