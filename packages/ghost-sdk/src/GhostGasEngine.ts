/**
 * @file GhostGasEngine.ts
 * @description GhostChain gas estimation and fee management.
 * Connects to the ghost-gas-engine service for dynamic fee computation.
 *
 * GST unit: 1e18 (same decimal precision as GST token)
 */

export const GST_UNIT = BigInt("1000000000000000000"); // 1 GST

type GasRecommendationResponse = {
  recommendation?: { recommendedBaseFee?: string; recommendedPriorityFee?: string };
};
type EthEstimateGasResponse = { result?: string; error?: { message: string } };

export class GhostGasEngine {
  readonly gasEngineUrl: string;
  /** Optional RPC URL used for eth_estimateGas calls. */
  private readonly rpcUrl: string | undefined;

  constructor(gasEngineUrl = "http://ghost-gas-engine:4040", rpcUrl?: string) {
    this.gasEngineUrl = gasEngineUrl;
    this.rpcUrl = rpcUrl;
  }

  async estimateGas(tx: { to: string; data: string; value?: bigint }): Promise<bigint> {
    if (!this.rpcUrl) {
      throw new Error(
        "GhostGasEngine.estimateGas: rpcUrl required — pass it as second constructor arg: new GhostGasEngine(gasEngineUrl, rpcUrl)"
      );
    }
    const id = Date.now();
    const params: Record<string, string | undefined> = { to: tx.to, data: tx.data };
    if (tx.value !== undefined) params.value = `0x${tx.value.toString(16)}`;
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_estimateGas", id, params: [params] }),
    });
    if (!res.ok) throw new Error(`GhostGasEngine.estimateGas: HTTP ${res.status}`);
    const json = (await res.json()) as EthEstimateGasResponse;
    if (json.error) throw new Error(`GhostGasEngine.estimateGas: ${json.error.message}`);
    if (!json.result) throw new Error("GhostGasEngine.estimateGas: empty result from RPC");
    return BigInt(json.result);
  }

  async getBaseFeePerGas(): Promise<bigint> {
    const res = await fetch(`${this.gasEngineUrl}/v1/gas/recommendations`);
    if (!res.ok) throw new Error(`GhostGasEngine.getBaseFeePerGas: HTTP ${res.status} from gas engine`);
    const json = (await res.json()) as GasRecommendationResponse;
    const baseFee = json.recommendation?.recommendedBaseFee;
    if (!baseFee) throw new Error("GhostGasEngine.getBaseFeePerGas: no recommendation available from gas engine");
    return BigInt(baseFee);
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
