export interface Contract {
  address: string;
  name?: string;
  abi?: unknown;
  verified: boolean;
  proxyType?: string;
  owner?: string;
}

export interface ContractCallStats {
  calls: number;
  avgGas: number;
  reverts: number;
  timeRange: string;
}
