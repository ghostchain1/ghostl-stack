export type ChainKey = "ghostchain" | "ghostl2" | "ghostl3";
export type GhostLayer = "L1" | "L2" | "L3";
export type GhostEnvironment = "devnet" | "testnet" | "mainnet";
export type GhostProofMode = "fraud" | "zk";

export interface GhostNativeCurrency {
  name: string;
  symbol: "GST";
  decimals: number;
}

export interface GhostChainPorts {
  hostRpc: number;
  hostWs: number;
  controlRpc: number;
  sequencer: number;
  deriver: number;
  settlement: number;
  bridge: number;
  proof: number;
  observability?: number;
}

export interface GhostContractAddresses {
  settlementGateway: string;
  stateCommitmentChain: string;
  messageBus: string;
  assetBridge: string;
  disputeRegistry: string;
  finalityOracle: string;
  registry: string;
  rollup: string;
}

export interface GhostRpcEndpoints {
  publicHttp: string;
  localHttp: string;
  internalHttp: string;
  ws: string;
}

export interface GhostBrandingMetadata {
  explorer: "GhostScan";
  wallet: "GhostWallet";
  dns: "GNS";
  dex: "GhostXchange";
  gasTokenSymbol: "GST";
}

export interface GhostChainDescriptor {
  key: ChainKey;
  displayName: string;
  layer: GhostLayer;
  chainId: number;
  parent: ChainKey | null;
  rpc: GhostRpcEndpoints;
  explorerUrl: string;
  nativeCurrency: GhostNativeCurrency;
  proofMode: GhostProofMode;
  contracts: GhostContractAddresses;
  ports: GhostChainPorts;
  branding: GhostBrandingMetadata;
  routingPolicy: string;
  directL1Bypass: boolean;
}

export interface GhostEnvironmentDescriptor {
  name: GhostEnvironment;
  chains: Record<ChainKey, GhostChainDescriptor>;
}
