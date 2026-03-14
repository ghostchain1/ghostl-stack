/**
 * GhostWallet
 *
 * Extends ghost v6 Wallet with GhostStack layer awareness.
 * Works with ghostJsonRpcProvider out of the box.
 */
import { Wallet } from "ethers";
import { ghostJsonRpcProvider } from "./provider.js";
import { type GhostLayer } from "./networks.js";
export declare class GhostWallet extends Wallet {
    /** The GhostStack layer this wallet targets. */
    readonly layer: GhostLayer;
    constructor(privateKey: string | {
        privateKey: string;
    }, providerOrLayer?: ghostJsonRpcProvider | GhostLayer, layer?: GhostLayer);
    /** Switch this wallet to a different GhostStack layer, returning a new instance. */
    connectToLayer(layer: GhostLayer, url?: string): GhostWallet;
    /** Convenience: get GST balance in wei for this wallet's address. */
    getGSTBalance(): Promise<bigint>;
    /** Returns `{ address, layer, chainId }` identification for this wallet. */
    identify(): Promise<{
        address: string;
        layer: GhostLayer;
        chainId: number;
    }>;
}
/**
 * Create a GhostWallet from a mnemonic phrase.
 *
 * ```ts
 * const wallet = ghostWalletFromMnemonic("word1 word2 ...", "L2");
 * ```
 */
export declare function ghostWalletFromMnemonic(mnemonic: string, layer?: GhostLayer, path?: string, url?: string): GhostWallet;
/**
 * Create a random GhostWallet on the given layer.
 *
 * ```ts
 * const wallet = createRandomGhostWallet("L3");
 * ```
 */
export declare function createRandomGhostWallet(layer?: GhostLayer, url?: string): GhostWallet;
//# sourceMappingURL=wallet.d.ts.map