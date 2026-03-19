import { getChain } from "@ghostchain/ghost-chain-registry";

/**
 * GhostChain network definitions.
 *
 * Chain IDs match the live GhostStack deployment:
 *   L1: GhostChain mainnet-equiv Anvil node  (chainId 14000101)
 *   L2: GhostL2 canonical execution RPC      (chainId 901)
 *   L3: GhostL3 canonical execution RPC      (chainId 903)
 */

export type GhostLayer = "L1" | "L2" | "L3";

export interface GhostNetworkConfig {
  /** Human-readable name for the network */
  name: string;
  /** EIP-155 chain ID */
  chainId: number;
  /** Gas / native token symbol */
  symbol: "GST";
  /** Default public RPC URL */
  rpc: string;
  /** Layer in the GhostStack hierarchy */
  layer: GhostLayer;
  /** Optional block explorer URL */
  explorer?: string;
}

function rpcFor(layer: GhostLayer): string {
  if (typeof process !== "undefined") {
    const envKey = `GHOST_${layer}_RPC`;
    const envVal = process.env[envKey];
    if (envVal) return envVal;
    // fall back to RPC_L1 / RPC_L2 / RPC_L3 (matches contracts/.env naming)
    const legacyKey = `RPC_${layer}`;
    const legacyVal = process.env[legacyKey];
    if (legacyVal) return legacyVal;
  }
  return layer === "L1"
    ? getChain("ghostchain").rpc.localHttp
    : layer === "L2"
      ? getChain("ghostl2").rpc.localHttp
      : getChain("ghostl3").rpc.localHttp;
}

export const GhostNetworks: Record<GhostLayer, GhostNetworkConfig> = {
  L1: {
    name: getChain("ghostchain").displayName,
    chainId: getChain("ghostchain").chainId,
    symbol: "GST",
    rpc: rpcFor("L1"),
    layer: "L1",
    explorer: getChain("ghostchain").explorerUrl,
  },
  L2: {
    name: getChain("ghostl2").displayName,
    chainId: getChain("ghostl2").chainId,
    symbol: "GST",
    rpc: rpcFor("L2"),
    layer: "L2",
    explorer: getChain("ghostl2").explorerUrl,
  },
  L3: {
    name: getChain("ghostl3").displayName,
    chainId: getChain("ghostl3").chainId,
    symbol: "GST",
    rpc: rpcFor("L3"),
    layer: "L3",
    explorer: getChain("ghostl3").explorerUrl,
  },
};

/** Resolve the parent layer (L3 → L2 → L1). */
export function parentLayer(layer: GhostLayer): GhostLayer | null {
  if (layer === "L3") return "L2";
  if (layer === "L2") return "L1";
  return null;
}

/** Ordered derivation path: L3 derives from L2 derives from L1. */
export const DERIVATION_PATH: GhostLayer[] = ["L1", "L2", "L3"];

/** Quick-access helper: returns the network config for a given chain ID. */
export function networkByChainId(chainId: number): GhostNetworkConfig | undefined {
  return Object.values(GhostNetworks).find((n) => n.chainId === chainId);
}
