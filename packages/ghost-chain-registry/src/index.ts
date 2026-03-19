import {
  BASE_CHAINS,
  CANONICAL_CHAIN_IDS,
  CHAIN_KEYS,
  CONTROL_RPC_PORTS,
  GHOST_ENVIRONMENTS,
  HOST_RPC_PORTS,
} from "./chains";
import type {
  ChainKey,
  GhostChainDescriptor,
  GhostEnvironment,
  GhostEnvironmentDescriptor,
  GhostLayer,
} from "./types";

export type {
  ChainKey,
  GhostBrandingMetadata,
  GhostChainDescriptor,
  GhostChainPorts,
  GhostContractAddresses,
  GhostEnvironment,
  GhostEnvironmentDescriptor,
  GhostLayer,
  GhostNativeCurrency,
  GhostProofMode,
  GhostRpcEndpoints,
} from "./types";

export {
  BASE_CHAINS,
  CANONICAL_CHAIN_IDS,
  CHAIN_KEYS,
  CONTROL_RPC_PORTS,
  GHOST_ENVIRONMENTS,
  HOST_RPC_PORTS,
};

export function getChain(
  key: ChainKey,
  environment: GhostEnvironment = "devnet",
): GhostChainDescriptor {
  return GHOST_ENVIRONMENTS[environment].chains[key];
}

export function getEnvironment(
  environment: GhostEnvironment = "devnet",
): GhostEnvironmentDescriptor {
  return GHOST_ENVIRONMENTS[environment];
}

export function chainKeyForId(chainId: number): ChainKey | undefined {
  return (Object.entries(CANONICAL_CHAIN_IDS).find(([, value]) => value === chainId)?.[0] ??
    undefined) as ChainKey | undefined;
}

export function layerForChain(key: ChainKey): GhostLayer {
  return getChain(key).layer;
}

export function assertCanonicalChainId(chainId: number): ChainKey {
  const key = chainKeyForId(Number(chainId));
  if (!key) {
    throw new Error(`unknown_ghost_chain_id:${chainId}`);
  }
  return key;
}
