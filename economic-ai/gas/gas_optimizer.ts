/**
 * GhostChain Economic AI Engine — Gas Optimizer
 *
 * Computes EIP-1559-inspired adaptive base-fee recommendations for
 * GhostChain L1, GhostL2, and GhostL3.
 *
 * Methodology:
 *   1. Maintain a rolling window of gas-utilisation ratios per chain.
 *   2. Apply a multiplicative adjustment factor identical to EIP-1559
 *      (±12.5 % per block at 100%/0% utilisation, target 50%).
 *   3. Incorporate a DemandTier multiplier to preemptively raise/lower fees
 *      ahead of congestion.
 *   4. POST advisory recommendations to GhostBrain Core (:7900).
 *      On-chain base-fee changes require governance ratification via the
 *      signing-relay — this module never writes directly to chain state.
 *
 * Gas token: GST (all fee values in GST smallest unit, bigint).
 */

// ── Chain constants ────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;
export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

// ── Types ──────────────────────────────────────────────────────────────────

export type DemandTier = "low" | "normal" | "elevated" | "high" | "critical";

export interface GasObservation {
  chainId:   ChainId;
  height:    number;
  timestamp: number;
  baseFeeGst: bigint;   // current base fee in GST smallest unit
  gasUsed:   bigint;
  gasLimit:  bigint;
}

export interface GasRecommendation {
  chainId:        ChainId;
  timestamp:      number;
  currentBaseFee: bigint;
  recommendedFee: bigint;
  adjustmentPct:  number;   // percentage change from current
  gasUtilPct:     number;
  demandTier:     DemandTier;
  confidence:     number;   // 0-1, rises with warmup
}

// ── GasOptimizer ──────────────────────────────────────────────────────────

export interface GasOptimizerOptions {
  ghostbrainUrl?:  string;
  relayUrl?:       string;
  /** Gas utilisation target (default 50 %). */
  targetUtilPct?:  number;
  /** Maximum single-step adjustment fraction (default 0.125 = 12.5 %). */
  maxAdjFraction?: number;
  /** Rolling window size. */
  windowSize?:     number;
  /** Minimum samples before recommendation is emitted. */
  warmupSamples?:  number;
  /** Floor and ceiling for recommended fee. */
  feeCeilingGst?:  bigint;
  feeFloorGst?:    bigint;
}

const MAX_WINDOW      = 200;
const DEMAND_MULTIPLIERS: Record<DemandTier, number> = {
  low:      0.90,
  normal:   1.00,
  elevated: 1.10,
  high:     1.20,
  critical: 1.40,
};

export class GasOptimizer {
  private readonly ghostbrainUrl:  string;
  private readonly relayUrl:       string;
  private readonly targetUtilPct:  number;
  private readonly maxAdjFraction: number;
  private readonly windowSize:     number;
  private readonly warmupSamples:  number;
  private readonly feeCeilingGst:  bigint;
  private readonly feeFloorGst:    bigint;

  private readonly utilHistory = new Map<ChainId, number[]>();
  private readonly feeHistory  = new Map<ChainId, bigint[]>();

  constructor(opts: GasOptimizerOptions = {}) {
    this.ghostbrainUrl  = opts.ghostbrainUrl  ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl       = opts.relayUrl       ?? (process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910");
    this.targetUtilPct  = opts.targetUtilPct  ?? 50;
    this.maxAdjFraction = opts.maxAdjFraction ?? 0.125;
    this.windowSize     = Math.min(opts.windowSize ?? 64, MAX_WINDOW);
    this.warmupSamples  = opts.warmupSamples  ?? 8;
    this.feeCeilingGst  = opts.feeCeilingGst  ?? 1_000_000_000_000n; // 1e12 GST unit
    this.feeFloorGst    = opts.feeFloorGst    ?? 1_000_000n;         // 1e6  GST unit
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async optimize(obs: GasObservation, demand: DemandTier = "normal"): Promise<GasRecommendation> {
    this.validateObs(obs);
    this.ingest(obs);

    const rec = this.compute(obs, demand);

    this.forwardGhostBrain(rec).catch((err: Error) =>
      console.error("[GasOptimizer] GhostBrain forward error:", err.message),
    );

    // Propose to relay when fee deviation > 5 %.
    if (Math.abs(rec.adjustmentPct) > 5 && rec.confidence >= 0.5) {
      this.proposeToRelay(rec).catch((err: Error) =>
        console.error("[GasOptimizer] relay proposal error:", err.message),
      );
    }

    return rec;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateObs(obs: GasObservation): void {
    if (obs.gasLimit <= 0n)      throw new Error("GasOptimizer: gasLimit must be > 0");
    if (obs.gasUsed < 0n)        throw new Error("GasOptimizer: gasUsed cannot be negative");
    if (obs.gasUsed > obs.gasLimit) throw new Error("GasOptimizer: gasUsed > gasLimit");
    if (obs.baseFeeGst < 0n)     throw new Error("GasOptimizer: baseFeeGst cannot be negative");
  }

  private ingest(obs: GasObservation): void {
    const utilPct = Number((obs.gasUsed * 100n) / obs.gasLimit);
    this.pushNum(this.utilHistory, obs.chainId, utilPct);
    this.pushBig(this.feeHistory,  obs.chainId, obs.baseFeeGst);
  }

  private pushNum(map: Map<ChainId, number[]>, id: ChainId, v: number): void {
    if (!map.has(id)) map.set(id, []);
    const buf = map.get(id)!;
    buf.push(v);
    if (buf.length > this.windowSize) buf.shift();
  }

  private pushBig(map: Map<ChainId, bigint[]>, id: ChainId, v: bigint): void {
    if (!map.has(id)) map.set(id, []);
    const buf = map.get(id)!;
    buf.push(v);
    if (buf.length > this.windowSize) buf.shift();
  }

  private compute(obs: GasObservation, demand: DemandTier): GasRecommendation {
    const utilBuf     = this.utilHistory.get(obs.chainId) ?? [];
    const ready       = utilBuf.length >= this.warmupSamples;
    const confidence  = Math.min(utilBuf.length / this.warmupSamples, 1.0);
    const avgUtil     = utilBuf.length > 0
      ? utilBuf.reduce((a, b) => a + b, 0) / utilBuf.length
      : Number((obs.gasUsed * 100n) / obs.gasLimit);

    let recommendedFee = obs.baseFeeGst;

    if (ready) {
      // EIP-1559 multiplicative adjustment on rolling avgUtil.
      const delta = (avgUtil - this.targetUtilPct) / 100;
      const adj   = 1.0 + Math.max(-this.maxAdjFraction, Math.min(this.maxAdjFraction, delta));
      const demMul = DEMAND_MULTIPLIERS[demand];

      // Apply as bigint arithmetic (scale by 1e6 to preserve precision).
      const SCALE = 1_000_000n;
      const adjInt = BigInt(Math.round(adj * demMul * 1_000_000));
      recommendedFee = (obs.baseFeeGst * adjInt) / SCALE;
    }

    // Clamp to floor / ceiling.
    recommendedFee = this.clamp(recommendedFee, this.feeFloorGst, this.feeCeilingGst);

    const adjustmentPct = obs.baseFeeGst > 0n
      ? Number((recommendedFee - obs.baseFeeGst) * 10_000n / obs.baseFeeGst) / 100
      : 0;

    return {
      chainId:        obs.chainId,
      timestamp:      obs.timestamp,
      currentBaseFee: obs.baseFeeGst,
      recommendedFee,
      adjustmentPct,
      gasUtilPct:     avgUtil,
      demandTier:     demand,
      confidence,
    };
  }

  private clamp(val: bigint, lo: bigint, hi: bigint): bigint {
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
  }

  private async forwardGhostBrain(rec: GasRecommendation): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/gas-recommendation`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:  rec.chainId,
        gas_token: "GST",
        ...rec,
        /** JSON serialises bigint as string for transport. */
        currentBaseFee: rec.currentBaseFee.toString(),
        recommendedFee: rec.recommendedFee.toString(),
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async proposeToRelay(rec: GasRecommendation): Promise<void> {
    const resp = await fetch(`${this.relayUrl}/relay/gas/propose`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:       rec.chainId,
        gas_token:      "GST",
        from:           "ghostbrain-economic-ai",
        recommendedFee: rec.recommendedFee.toString(),
        adjustmentPct:  rec.adjustmentPct,
        confidence:     rec.confidence,
        timestamp:      rec.timestamp,
      }),
    });
    if (!resp.ok) throw new Error(`relay responded ${resp.status}`);
  }
}
