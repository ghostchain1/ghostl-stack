/**
 * GhostLayerRouter — routes transactions optimally across GhostChain layers.
 */
import { GhostProvider } from "../core/GhostProvider";
import { GhostGasEngine } from "../gas/GhostGasEngine";
import { GhostLayer, GhostRpcRouter } from "../rpc/GhostRpcRouter";

export class GhostLayerRouter {
  private router: GhostRpcRouter;

  constructor(router: GhostRpcRouter) {
    this.router = router;
  }

  /**
   * Selects the cheapest layer for a given transaction value.
   * Prefers L3 for small txs, L2 for medium, L1 for large/settlement.
   */
  async selectLayer(valueGhostUnits: bigint): Promise<GhostLayer> {
    if (valueGhostUnits < 1_000_000_000_000_000n) return "L3";
    if (valueGhostUnits < 100_000_000_000_000_000n) return "L2";
    return "L1";
  }

  async estimateLayerGas(layer: GhostLayer, tx: unknown): Promise<string> {
    const provider = this.router.resolve(layer);
    return GhostGasEngine.estimate(provider, tx as Parameters<typeof GhostGasEngine.estimate>[1]);
  }
}
