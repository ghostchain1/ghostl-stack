import type { GhostFeeSuggestion, Hex } from "./types.js";
import { hexToBigInt } from "./hex.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";

export type GhostGasPolicy = {
  priorityMultiplier: number; // e.g. 1.0–2.0
  maxFeeMultiplier: number;   // e.g. 1.2–3.0
  minPriorityFeePerGas: bigint;
};

/** Ghost-native gas fee oracle — no ethers dependency. */
export class GhostNativeGasEngine {
  private policy: GhostGasPolicy = {
    priorityMultiplier: 1.0,
    maxFeeMultiplier: 1.5,
    minPriorityFeePerGas: 1_000_000_000n, // 1 GhostGwei
  };

  constructor(private readonly provider: GhostNativeProvider) {}

  setPolicy(policy: Partial<GhostGasPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  async suggestFees(): Promise<GhostFeeSuggestion> {
    let baseFee: bigint | undefined;
    try {
      type FeeHistoryRpc = { baseFeePerGas?: Hex[] };
      const fh = await this.provider.rpc.request<FeeHistoryRpc>("eth_feeHistory", [
        "0x5", "latest", [10, 50, 90],
      ]);
      const baseFees = fh.baseFeePerGas ?? [];
      const last = baseFees[baseFees.length - 1];
      if (last) baseFee = hexToBigInt(last);
    } catch { /* ignore — fallback below */ }

    const priority = this._max(this.policy.minPriorityFeePerGas, 2_000_000_000n);
    const base = baseFee ?? 10_000_000_000n;
    const maxPriorityFeePerGas = this._mul(priority, this.policy.priorityMultiplier);
    const maxFeePerGas = this._mul(base + maxPriorityFeePerGas, this.policy.maxFeeMultiplier);
    return { baseFeePerGas: baseFee, maxFeePerGas, maxPriorityFeePerGas };
  }

  private _mul(v: bigint, m: number): bigint {
    return (v * BigInt(Math.floor(m * 1000))) / 1000n;
  }
  private _max(a: bigint, b: bigint): bigint { return a > b ? a : b; }
}
