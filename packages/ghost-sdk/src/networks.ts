/**
 * GhostChain network definitions.
 *
 * Chain IDs match the live GhostStack deployment:
 *   L1: GhostChain mainnet-equiv Anvil node  (chainId 14000101)
 *   L2: GhostL2 OP Stack op-geth             (chainId 901)
 *   L3: GhostL3 OP Stack op-geth             (chainId 903)
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

/** Local / devnet RPC endpoints */
const LOCAL_RPCS = {
  L1: "http://localhost:18545",
  L2: "http://localhost:29547",
  L3: "http://localhost:39545",
};

/** Production / public RPC endpoints (override with env vars at runtime) */
const _PUBLIC_RPCS = {
  L1: "https://rpc.ghostchain.cloud",
  L2: "https://l2.rpc.ghostchain.cloud",
  L3: "https://l3.rpc.ghostchain.cloud",
};

function rpcFor(layer: GhostLayer): string {
  // Allow callers to override via environment variables at runtime.
  if (typeof process !== "undefined") {
    const envKey = `GHOST_${layer}_RPC`;
    const envVal = process.env[envKey];
    if (envVal) return envVal;
    // fall back to RPC_L1 / RPC_L2 / RPC_L3 (matches contracts/.env naming)
    const legacyKey = `RPC_${layer}`;
    const legacyVal = process.env[legacyKey];
    if (legacyVal) return legacyVal;
  }
  return LOCAL_RPCS[layer];
}

export const GhostNetworks: Record<GhostLayer, GhostNetworkConfig> = {
  L1: {
    name: "ghostchain",
    chainId: 14000101,
    symbol: "GST",
    rpc: rpcFor("L1"),
    layer: "L1",
    explorer: "https://explorer.ghostchain.cloud",
  },
  L2: {
    name: "ghostl2",
    chainId: 901,
    symbol: "GST",
    rpc: rpcFor("L2"),
    layer: "L2",
    explorer: "https://l2.explorer.ghostchain.cloud",
  },
  L3: {
    name: "ghostl3",
    chainId: 903,
    symbol: "GST",
    rpc: rpcFor("L3"),
    layer: "L3",
    explorer: "https://l3.explorer.ghostchain.cloud",
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
