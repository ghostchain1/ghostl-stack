/** The three canonical GhostChain mainchains. Any other chain ID is rejected. */
export const MAINCHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;

export type MainchainId = typeof MAINCHAIN_IDS[keyof typeof MAINCHAIN_IDS];
export type MainchainName = 'GhostChain' | 'GhostL2' | 'GhostL3';

export const MAINCHAIN_REGISTRY: Readonly<Record<MainchainId, { name: MainchainName; layer: 'L1' | 'L2' | 'L3' }>> = {
  [MAINCHAIN_IDS.L1]: { name: 'GhostChain', layer: 'L1' },
  [MAINCHAIN_IDS.L2]: { name: 'GhostL2',    layer: 'L2' },
  [MAINCHAIN_IDS.L3]: { name: 'GhostL3',    layer: 'L3' },
} as const;

export function isMainchainId(chainId: number): chainId is MainchainId {
  return chainId in MAINCHAIN_REGISTRY;
}

export interface ChainInfo {
  chainId: string;
  name: string;
  env: string;
  consensus: string;
}

export interface EpochInfo {
  epoch: number;
  round: number;
  start: string;
  end: string;
}

export interface ReorgEvent {
  depth: number;
  fromBlock: number;
  toBlock: number;
  time: string;
}
