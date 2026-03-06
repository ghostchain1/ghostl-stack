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

import {
  ghostJsonRpcProvider,
  createL1Provider,
  createL2Provider,
  createL3Provider,
} from "./provider.js";
import { DERIVATION_PATH, parentLayer, type GhostLayer } from "./networks.js";

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

export class GhostBridgeProvider {
  /** L1 provider (GhostChain) */
  readonly L1: ghostJsonRpcProvider;
  /** L2 provider (GhostL2) */
  readonly L2: ghostJsonRpcProvider;
  /** L3 provider (GhostL3) */
  readonly L3: ghostJsonRpcProvider;

  constructor(urls?: BridgeProviderUrls) {
    this.L1 = createL1Provider(urls?.L1);
    this.L2 = createL2Provider(urls?.L2);
    this.L3 = createL3Provider(urls?.L3);
  }

  /** Get the provider for a specific layer. */
  forLayer(layer: GhostLayer): ghostJsonRpcProvider {
    return this[layer];
  }

  /**
   * Returns route info for every layer in the derivation order L1 → L2 → L3.
   * Useful for dashboards and health checks.
   */
  async getRouteInfo(): Promise<LayerRouteInfo[]> {
    const results = await Promise.allSettled(
      DERIVATION_PATH.map(async (layer) => {
        const provider = this.forLayer(layer);
        const [net, blockNumber] = await Promise.all([
          provider.getNetwork(),
          provider.getGhostBlockNumber(),
        ]);
        return {
          layer,
          chainId: Number(net.chainId),
          blockNumber,
          parentLayer: parentLayer(layer),
        } satisfies LayerRouteInfo;
      })
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const layer = DERIVATION_PATH[i]!;
      return {
        layer,
        chainId: -1,
        blockNumber: -1,
        parentLayer: parentLayer(layer),
      };
    });
  }

  /**
   * Submit a raw signed transaction to the appropriate layer.
   *
   * For L2/L3 this goes directly to the sequencer.
   * For L1 it goes to the Anvil / GhostChain node.
   */
  async sendRawTransaction(layer: GhostLayer, signedTx: string): Promise<string> {
    return this.forLayer(layer).send("eth_sendRawTransaction", [signedTx]) as Promise<string>;
  }

  /**
   * Broadcast the same signed tx to all layers simultaneously.
   * Only one will accept it (the one matching the tx chain ID).
   * Returns a record of { layer → txHash | errorMessage }.
   */
  async broadcastToAll(
    signedTx: string
  ): Promise<Record<GhostLayer, string>> {
    const entries = await Promise.allSettled(
      DERIVATION_PATH.map(async (layer) => {
        const hash = await this.sendRawTransaction(layer, signedTx);
        return [layer, hash] as const;
      })
    );

    return Object.fromEntries(
      entries.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : [DERIVATION_PATH[i], `error: ${(r.reason as Error).message}`]
      )
    ) as Record<GhostLayer, string>;
  }
}
