import type { ChainInfo, EpochInfo, ReorgEvent } from '../../../../../packages/types';

export interface ChainStatusService {
  getChainInfo(): Promise<ChainInfo>;
  getEpochInfo(): Promise<EpochInfo>;
  getBlockTimeMs(): Promise<number>;
  getFinalityLag(): Promise<number>;
  getReorgEvents(limit?: number): Promise<ReorgEvent[]>;
}

export interface ConsensusTelemetryService {
  getParticipationRate(): Promise<number>;
  getLatencyMetrics(): Promise<Record<string, number>>;
  getHealthSummary(): Promise<Record<string, unknown>>;
}

export interface PeerGraphService {
  listPeers(): Promise<{ id: string; address: string; latencyMs?: number }[]>;
  getTopology(): Promise<Record<string, unknown>>;
}
