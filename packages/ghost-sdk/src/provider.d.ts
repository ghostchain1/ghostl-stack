/**
 * ghostJsonRpcProvider
 *
 * Extends ghost v6 JsonRpcProvider with:
 *  - Layer awareness (L1 / L2 / L3)
 *  - gst_* method canonicalisation (falls back to eth_* when not supported)
 *  - GST balance helpers
 *  - Network info metadata
 *  - Automatic network config from GhostNetworks if no explicit network is passed
 */
import { JsonRpcProvider, Network } from "ethers";
import { type GhostLayer, type GhostNetworkConfig } from "./networks.js";
export declare class ghostJsonRpcProvider extends JsonRpcProvider {
    /** Which layer of the GhostStack this provider is connected to. */
    readonly layer: GhostLayer;
    /**
     * @param url     JSON-RPC endpoint URL.  Defaults to the local dev RPC for
     *                the given layer (from GhostNetworks / env vars).
     * @param layer   "L1" | "L2" | "L3".  Defaults to "L1".
     * @param network Optional ghost Network override.  When omitted the
     *                provider fetches the chain ID from the node on first use.
     */
    constructor(url?: string, layer?: GhostLayer, network?: Network | {
        name: string;
        chainId: number;
    });
    /** Returns the GhostStack layer ("L1" | "L2" | "L3"). */
    getLayer(): GhostLayer;
    /** Returns the native gas token symbol ("GST"). */
    getGasToken(): Promise<"GST">;
    /**
     * Returns high-level network metadata for this provider.
     * Also resolves the live chain ID from the node to confirm connectivity.
     */
    getGhostNetworkInfo(): Promise<GhostNetworkConfig & {
        liveChainId: number;
    }>;
    /**
     * Calls a gst_* method first; if the node returns method-not-found it
     * transparently retries with the equivalent eth_* method.
     *
     * Example: gst_blockNumber → eth_blockNumber
     */
    sendGstMethod<T = unknown>(gstMethod: string, ethMethod: string, params?: unknown[]): Promise<T>;
    /** Canonical block number (tries gst_blockNumber, falls back to eth_blockNumber). */
    getGhostBlockNumber(): Promise<number>;
    /** GST balance (wei) of address – alias for getBalance with GST branding. */
    getGSTBalance(address: string): Promise<bigint>;
    /** GST balance formatted in GST units (not wei). */
    getGSTBalanceFormatted(address: string): Promise<string>;
}
/** Create a provider for GhostChain L1. */
export declare function createL1Provider(url?: string): ghostJsonRpcProvider;
/** Create a provider for GhostL2. */
export declare function createL2Provider(url?: string): ghostJsonRpcProvider;
/** Create a provider for GhostL3. */
export declare function createL3Provider(url?: string): ghostJsonRpcProvider;
/**
 * Create one provider per layer, keyed by layer name.
 *
 * ```ts
 * const { L1, L2, L3 } = createAllLayerProviders();
 * ```
 */
export declare function createAllLayerProviders(urls?: {
    L1?: string;
    L2?: string;
    L3?: string;
}): Record<GhostLayer, ghostJsonRpcProvider>;
//# sourceMappingURL=provider.d.ts.map