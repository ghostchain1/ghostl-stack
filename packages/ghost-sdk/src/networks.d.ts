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
export declare const GhostNetworks: Record<GhostLayer, GhostNetworkConfig>;
/** Resolve the parent layer (L3 → L2 → L1). */
export declare function parentLayer(layer: GhostLayer): GhostLayer | null;
/** Ordered derivation path: L3 derives from L2 derives from L1. */
export declare const DERIVATION_PATH: GhostLayer[];
/** Quick-access helper: returns the network config for a given chain ID. */
export declare function networkByChainId(chainId: number): GhostNetworkConfig | undefined;
//# sourceMappingURL=networks.d.ts.map