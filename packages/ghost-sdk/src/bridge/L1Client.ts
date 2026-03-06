/**
 * L1Client — GhostChain L1 (sovereign chain, chainId 14000101) client.
 *
 * Wraps GhostPublicClient with L1-specific configuration and chain awareness.
 */

import { GhostPublicClient } from "../clients/GhostPublicClient.js";
import type { GhostPublicClientConfig } from "../clients/GhostPublicClient.js";

export const GHOST_L1_CHAIN_ID = 14000101;
export const GHOST_L1_NAME = "GhostChain L1";

export type L1ClientConfig = Partial<GhostPublicClientConfig>;

export class L1Client extends GhostPublicClient {
  constructor(config: L1ClientConfig = {}) {
    super({
      rpcUrl: config.rpcUrl ?? "http://localhost:18545",
      chainId: GHOST_L1_CHAIN_ID,
      ...config,
    });
  }

  get chainName(): string { return GHOST_L1_NAME; }
  get chainId(): number { return GHOST_L1_CHAIN_ID; }
}
