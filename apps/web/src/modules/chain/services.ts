import type { ChainInfo, EpochInfo, ReorgEvent } from '@ghostl/types/chain';

export interface ChainStatus {
  chain: ChainInfo;
  finalizedHeight?: number;
  blockTimeMs?: number;
  epoch?: EpochInfo;
}

export interface ChainStatusService {
  getStatus(): Promise<ChainStatus>;
  listReorgs(limit?: number): Promise<ReorgEvent[]>;
}

export interface ConsensusTelemetryService {
  getEpoch(): Promise<EpochInfo>;
  getBlockTime(): Promise<number>;
}

export interface PeerGraphService {
  listPeers(): Promise<{ id: string; client: string; latencyMs?: number; country?: string; peers?: number }[]>;
}
