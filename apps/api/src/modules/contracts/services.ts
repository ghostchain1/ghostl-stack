import type { Contract, ContractCallStats } from '../../../../../packages/types';

export interface ContractRegistryService {
  list(): Promise<Contract[]>;
  get(address: string): Promise<Contract | null>;
  register(contract: Omit<Contract, 'verified'>): Promise<Contract>;
  update(address: string, input: Partial<Contract>): Promise<Contract>;
}

export interface VerificationService {
  verify(address: string, source: string, abi: unknown): Promise<Contract>;
}

export interface ProxyInspectorService {
  inspect(address: string): Promise<{ proxyType?: string; implementation?: string }>;
}

export interface ContractRiskService {
  getRisk(address: string): Promise<{ score: number; reasons: string[] }>;
  getExecutionStats(address: string): Promise<ContractCallStats>;
}
