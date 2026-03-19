/**
 * L2Client — GhostChain L2 (chainId 901) client.
 */

import { GhostPublicClient } from "../clients/GhostPublicClient.js";
import type { GhostPublicClientConfig } from "../clients/GhostPublicClient.js";

export const GHOST_L2_CHAIN_ID = 901;
export const GHOST_L2_NAME = "GhostL2";

export type L2ClientConfig = Partial<GhostPublicClientConfig>;

export class L2Client extends GhostPublicClient {
  constructor(config: L2ClientConfig = {}) {
    super({
      rpcUrl: config.rpcUrl ?? "http://localhost:29547",
      chainId: GHOST_L2_CHAIN_ID,
      ...config,
    });
  }

  get chainName(): string { return GHOST_L2_NAME; }
  get chainId(): number { return GHOST_L2_CHAIN_ID; }
}
