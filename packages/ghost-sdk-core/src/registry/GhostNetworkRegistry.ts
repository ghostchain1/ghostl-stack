import {
  assertCanonicalChainId,
  getChain,
  type ChainKey,
  type GhostChainDescriptor,
} from "@ghostchain/ghost-chain-registry";

export enum ChainLayer {
  L1 = 1,
  L2 = 2,
  L3 = 3,
}

export interface GhostNativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface GhostNetwork {
  name: string;
  chainId: number;
  layer: ChainLayer;
  rpcUrl: string;
  fallbackRpcUrls: string[];
  nativeCurrency: GhostNativeCurrency;
  blockExplorerUrl?: string;
  isRollup: boolean;
}

function toLayer(key: ChainKey): ChainLayer {
  if (key === "ghostchain") return ChainLayer.L1;
  if (key === "ghostl2") return ChainLayer.L2;
  return ChainLayer.L3;
}

function toNetwork(key: ChainKey): GhostNetwork {
  const descriptor: GhostChainDescriptor = getChain(key);
  return {
    name: descriptor.displayName,
    chainId: descriptor.chainId,
    layer: toLayer(key),
    rpcUrl: descriptor.rpc.localHttp,
    fallbackRpcUrls: [],
    nativeCurrency: descriptor.nativeCurrency,
    blockExplorerUrl: descriptor.explorerUrl,
    isRollup: key !== "ghostchain",
  };
}

export const GHOST_L1: GhostNetwork = toNetwork("ghostchain");
export const GHOST_L2: GhostNetwork = toNetwork("ghostl2");
export const GHOST_L3: GhostNetwork = toNetwork("ghostl3");

export class GhostNetworkRegistry {
  private static readonly _networks: Map<ChainLayer, GhostNetwork> = new Map([
    [ChainLayer.L1, GHOST_L1],
    [ChainLayer.L2, GHOST_L2],
    [ChainLayer.L3, GHOST_L3],
  ]);

  static get(layer: ChainLayer): GhostNetwork {
    const net = this._networks.get(layer);
    if (!net) {
      throw new Error(`GhostNetworkRegistry: no network for layer ${layer}`);
    }
    return net;
  }

  static getByChainId(chainId: number): GhostNetwork | undefined {
    const key = (() => {
      try {
        return assertCanonicalChainId(chainId);
      } catch {
        return undefined;
      }
    })();
    if (!key) return undefined;
    return toNetwork(key);
  }

  static all(): GhostNetwork[] {
    return Array.from(this._networks.values());
  }

  static register(layer: ChainLayer, network: GhostNetwork): void {
    this._networks.set(layer, network);
  }

  static isGhostChain(chainId: number): boolean {
    return this.getByChainId(chainId) !== undefined;
  }
}

export const GhostNetworks = {
  L1: GHOST_L1,
  L2: GHOST_L2,
  L3: GHOST_L3,
} as const;
