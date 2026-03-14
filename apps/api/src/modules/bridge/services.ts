import type { BridgeControl, Transfer } from '../../../../../packages/types';

export interface BridgeService {
  list(): Promise<string[]>;
  getControls(bridgeId: string): Promise<BridgeControl>;
  setControls(bridgeId: string, controls: Partial<BridgeControl>): Promise<BridgeControl>;
}

export interface TransferLifecycleService {
  list(status?: Transfer['status']): Promise<Transfer[]>;
  get(id: string): Promise<Transfer | null>;
  retry(id: string): Promise<void>;
  pause(bridgeId: string): Promise<void>;
}

export interface LiquidityService {
  getPools(): Promise<{ id: string; tvl: string; assets: string[] }[]>;
  rebalance(poolId: string, target: Record<string, string>): Promise<void>;
}

export interface DisputeService {
  list(): Promise<{ id: string; status: string; createdAt: string }[]>;
  raise(dispute: { transferId: string; reason: string }): Promise<{ id: string }>;
  resolve(id: string, action: 'accept' | 'reject'): Promise<void>;
}
