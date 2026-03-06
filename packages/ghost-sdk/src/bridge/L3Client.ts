/**
 * L3Client — GhostChain L3 (sovereign app-chain, chainId 903) client.
 */

import { GhostPublicClient } from "../clients/GhostPublicClient.js";
import type { GhostPublicClientConfig } from "../clients/GhostPublicClient.js";

export const GHOST_L3_CHAIN_ID = 903;
export const GHOST_L3_NAME = "GhostL3";

export type L3ClientConfig = Partial<GhostPublicClientConfig>;

export class L3Client extends GhostPublicClient {
  constructor(config: L3ClientConfig = {}) {
    super({
      rpcUrl: config.rpcUrl ?? "http://localhost:39545",
      chainId: GHOST_L3_CHAIN_ID,
      ...config,
    });
  }

  get chainName(): string { return GHOST_L3_NAME; }
  get chainId(): number { return GHOST_L3_CHAIN_ID; }
}
