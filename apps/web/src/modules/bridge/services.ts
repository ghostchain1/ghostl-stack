import type { BridgeControl, Transfer } from '@ghostl/types/bridge';

export interface BridgeService {
  list(): Promise<{ id: string; src: string; dst: string; status: string }[]>;
  getControl(): Promise<BridgeControl>;
}

export interface TransferLifecycleService {
  listTransfers(status?: Transfer['status']): Promise<Transfer[]>;
}

export interface LiquidityService {
  listPools(): Promise<{ id: string; chain: string; liquidity: string; fee?: string }[]>;
}

export interface DisputeService {
  list(): Promise<{ id: string; layer: string; status: string; evidence?: string }[]>;
}
