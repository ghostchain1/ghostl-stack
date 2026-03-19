import { getChain } from "@ghostchain/ghost-chain-registry";
import type { GhostChainConfig } from "../types";

const GHOSTCHAIN_L1 = getChain("ghostchain");
const GHOSTL2 = getChain("ghostl2");
const GHOSTL3 = getChain("ghostl3");

export const GhostChains: Record<string, GhostChainConfig> = {
  L1: {
    name: GHOSTCHAIN_L1.displayName,
    chainId: GHOSTCHAIN_L1.chainId,
    rpc: GHOSTCHAIN_L1.rpc.localHttp,
    fallbackRpcs: []
  },
  L2: {
    name: GHOSTL2.displayName,
    chainId: GHOSTL2.chainId,
    rpc: GHOSTL2.rpc.localHttp,
    fallbackRpcs: []
  },
  L3: {
    name: GHOSTL3.displayName,
    chainId: GHOSTL3.chainId,
    rpc: GHOSTL3.rpc.localHttp,
    fallbackRpcs: []
  }
};
