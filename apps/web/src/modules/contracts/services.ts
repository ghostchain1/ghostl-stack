import type { Contract, ContractCallStats } from '@ghostl/types/contracts';

export interface ContractRegistryService {
  list(): Promise<Contract[]>;
  get(address: string): Promise<Contract | null>;
}

export interface VerificationService {
  verify(address: string): Promise<void>;
  getAbi(address: string): Promise<unknown>;
}

export interface ProxyInspectorService {
  detect(address: string): Promise<{ proxyType?: string; implementation?: string; admin?: string }>;
}

export interface ContractRiskService {
  getRisk(address: string): Promise<{ score: number; issues?: string[] }>;
  getStats(address: string): Promise<ContractCallStats>;
}
