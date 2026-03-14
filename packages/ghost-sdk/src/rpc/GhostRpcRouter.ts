/**
 * GhostRpcRouter — routes RPC calls to the appropriate GhostChain layer.
 * L1 → GhostChain, L2 → GhostL2, L3 → GhostL3.
 */
import { GhostProvider } from "../core/GhostProvider";

export type GhostLayer = "L1" | "L2" | "L3";

export class GhostRpcRouter {
  private routes: Map<GhostLayer, GhostProvider> = new Map();

  register(layer: GhostLayer, provider: GhostProvider): void {
    this.routes.set(layer, provider);
  }

  resolve(layer: GhostLayer): GhostProvider {
    const provider = this.routes.get(layer);
    if (!provider) {
      throw new Error(`GhostRpcRouter: no provider registered for layer ${layer}`);
    }
    return provider;
  }

  async call(layer: GhostLayer, method: string, params: unknown[]): Promise<unknown> {
    return this.resolve(layer).call(method, params);
  }
}
