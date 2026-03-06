/**
 * @file GhostGasEngine.ts
 * @description GhostChain gas estimation and fee management.
 * Connects to the ghost-gas-engine service for dynamic fee computation.
 *
 * GST unit: 1e18 (same decimal precision as GST token)
 */

export const GST_UNIT = BigInt("1000000000000000000"); // 1 GST

export class GhostGasEngine {
  readonly gasEngineUrl: string;

  constructor(gasEngineUrl = "http://ghost-gas-engine:4040") {
    this.gasEngineUrl = gasEngineUrl;
  }

  async estimateGas(tx: { to: string; data: string; value?: bigint }): Promise<bigint> {
    // TODO: call ghost-gas-engine /estimate endpoint
    throw new Error("GhostGasEngine.estimateGas: not yet implemented");
  }

  async getBaseFeePerGas(): Promise<bigint> {
    // TODO: call ghost-gas-engine /basefee endpoint
    throw new Error("GhostGasEngine.getBaseFeePerGas: not yet implemented");
  }

  /** Convert GST wei amount to human-readable GST string */
  static formatGst(wei: bigint): string {
    const whole = wei / GST_UNIT;
    const frac = wei % GST_UNIT;
    return frac === 0n ? `${whole} GST` : `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")} GST`;
  }

  /** Parse human-readable GST string to wei bigint */
  static parseGst(gst: string): bigint {
    const [whole, frac = ""] = gst.replace(/\s*GST$/i, "").split(".");
    const fracPadded = frac.slice(0, 18).padEnd(18, "0");
    return BigInt(whole) * GST_UNIT + BigInt(fracPadded);
  }
}
