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
