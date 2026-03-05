/**
 * GhostBridgeProvider
 *
 * Multi-layer provider that holds one ghostJsonRpcProvider per layer and
 * automatically routes calls to the correct chain.
 *
 * Implements the GhostStack derivation rule:  L3 → L2 → L1
 *
 * Usage:
 *   const bridge = new GhostBridgeProvider();
 *   const block  = await bridge.L2.getGhostBlockNumber();
 *   const info   = await bridge.getRouteInfo();
 */
import { ghostJsonRpcProvider } from "./provider.js";
import { type GhostLayer } from "./networks.js";
export interface BridgeProviderUrls {
    L1?: string;
    L2?: string;
    L3?: string;
}
export interface LayerRouteInfo {
    layer: GhostLayer;
    chainId: number;
    blockNumber: number;
    parentLayer: GhostLayer | null;
}
export declare class GhostBridgeProvider {
    /** L1 provider (GhostChain) */
    readonly L1: ghostJsonRpcProvider;
    /** L2 provider (GhostL2) */
    readonly L2: ghostJsonRpcProvider;
    /** L3 provider (GhostL3) */
    readonly L3: ghostJsonRpcProvider;
    constructor(urls?: BridgeProviderUrls);
    /** Get the provider for a specific layer. */
    forLayer(layer: GhostLayer): ghostJsonRpcProvider;
    /**
     * Returns route info for every layer in the derivation order L1 → L2 → L3.
     * Useful for dashboards and health checks.
     */
    getRouteInfo(): Promise<LayerRouteInfo[]>;
    /**
     * Submit a raw signed transaction to the appropriate layer.
     *
     * For L2/L3 this goes directly to the sequencer.
     * For L1 it goes to the Anvil / Ethereum node.
     */
    sendRawTransaction(layer: GhostLayer, signedTx: string): Promise<string>;
    /**
     * Broadcast the same signed tx to all layers simultaneously.
     * Only one will accept it (the one matching the tx chain ID).
     * Returns a record of { layer → txHash | errorMessage }.
     */
    broadcastToAll(signedTx: string): Promise<Record<GhostLayer, string>>;
}
//# sourceMappingURL=bridge.d.ts.map