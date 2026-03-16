// GhostNode SDK — Node types

export type GhostChainLayer = 'L1' | 'L2' | 'L3';

export type GhostNodeRole =
  | 'validator'
  | 'sequencer'
  | 'bridge-validator'
  | 'oracle'
  | 'rpc'
  | 'archive';

export interface GhostNodeConfig {
  /** JSONRPC endpoint of the node */
  rpc: string;
  /** Optional Cosmos LCD endpoint (L1 only) */
  lcdEndpoint?: string;
  /** Auth token for protected endpoints */
  authToken?: string;
  layer: GhostChainLayer;
}

export interface GhostNodeStatus {
  layer: GhostChainLayer;
  role: GhostNodeRole;
  synced: boolean;
  blockNumber: bigint;
  blockHash: string;
  peers: number;
  uptimeSeconds: number;
  healthy: boolean;
}

export interface GhostNodeInfo {
  version: string;
  chainId: number;
  genesisHash: string;
  role: GhostNodeRole;
  name: string;
  enode: string;
}
