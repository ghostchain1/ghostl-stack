/**
 * GhostGasEngine — sovereign gas estimation replacing ethers fee data.
 * Uses ghost_estimateGas and ghost_gasPrice RPC methods.
 */
import { GhostProvider } from "../core/GhostProvider";
import { GhostTransaction } from "../core/GhostTransaction";

export class GhostGasEngine {
  static async estimate(provider: GhostProvider, tx: Partial<GhostTransaction>): Promise<string> {
    return provider.call("ghost_estimateGas", [tx]) as Promise<string>;
  }

  static async getGasPrice(provider: GhostProvider): Promise<string> {
    return provider.call("ghost_gasPrice", []) as Promise<string>;
  }

  static async getMaxPriorityFee(provider: GhostProvider): Promise<string> {
    return provider.call("ghost_maxPriorityFeePerGas", []) as Promise<string>;
  }

  /** Converts raw GhostUnits to GhostGas (10^9 GhostUnits = 1 GhostGas). */
  static toGhostGas(ghostUnits: bigint): string {
    return (ghostUnits / 1_000_000_000n).toString();
  }

  /** Converts GhostGas to GhostUnits. */
  static toGhostUnits(ghostGas: bigint): string {
    return (ghostGas * 1_000_000_000n).toString();
  }
}
