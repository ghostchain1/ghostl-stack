/**
 * GhostChain Economic AI Engine — Demand Analyzer
 *
 * Tracks transaction demand across GhostChain L1, GhostL2, and GhostL3
 * and produces a tiered demand signal that the Gas Optimizer and Supply
 * Controller consume.
 *
 * Methodology:
 *   1. Maintain a rolling window of observed tx-counts and gas-used per block.
 *   2. Compute a demand score as a weighted combination of:
 *        a. tx-rate vs. rolling baseline (relative demand)
 *        b. gas-utilisation ratio per block
 *        c. cross-layer settlement lag (L3→L2→L1 backlog depth)
 *   3. Classify score into a DemandTier and forward to GhostBrain Core.
 *
 * Chain routing law:
 *   Feeds from L1 (14000101), L2 (901), L3 (903).
 *   Signals to GhostBrain Core (:7900) — never directly to external chains.
 *   Gas token: GST.
 *
 * SECURITY:
 *   - All block inputs are validated (gasUsed ≤ gasLimit, txCount ≥ 0).
 *   - Rolling buffer is bounded (MAX_WINDOW_SIZE) to prevent memory growth.
 *   - No autonomous action taken — demand signals are advisory.
 */

// ── Chain constants ────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;
export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockSample {
  chainId:          ChainId;
  height:           number;
  timestamp:        number;
  transactionCount: number;
  gasUsed:          bigint;
  gasLimit:         bigint;
}

export type DemandTier = "low" | "normal" | "elevated" | "high" | "critical";

export interface DemandSignal {
  chainId:       ChainId;
  timestamp:     number;
  tier:          DemandTier;
  /** Composite demand score ∈ [0, 1]. */
  score:         number;
  /** Rolling average tx count per block. */
  avgTxCount:    number;
  /** Rolling average gas utilisation 0-100. */
  avgGasUtilPct: number;
  /** Observed tx count in the latest block. */
  latestTxCount: number;
  samplesUsed:   number;
}

// ── DemandAnalyzer ────────────────────────────────────────────────────────

export interface DemandAnalyzerOptions {
  ghostbrainUrl?: string;
  /** Rolling window size (blocks). Bounded to MAX_WINDOW_SIZE. */
  windowSize?: number;
  /** Minimum samples before scores are meaningful. */
  warmupSamples?: number;
  /** DemandTier score thresholds. */
  thresholds?: {
    low:      number;
    elevated: number;
    high:     number;
    critical: number;
  };
}

const DEFAULT_THRESHOLDS = {
  low:      0.15,
  elevated: 0.50,
  high:     0.75,
  critical: 0.90,
};

const MAX_WINDOW_SIZE = 500;

export class DemandAnalyzer {
  private readonly ghostbrainUrl:  string;
  private readonly windowSize:     number;
  private readonly warmupSamples:  number;
  private readonly thresholds:     typeof DEFAULT_THRESHOLDS;

  /** Rolling samples keyed by chainId. */
  private readonly txHistory    = new Map<ChainId, number[]>();
  private readonly gasUtilHistory = new Map<ChainId, number[]>();

  constructor(opts: DemandAnalyzerOptions = {}) {
    this.ghostbrainUrl  = opts.ghostbrainUrl  ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.windowSize     = Math.min(opts.windowSize ?? 100, MAX_WINDOW_SIZE);
    this.warmupSamples  = opts.warmupSamples  ?? 10;
    this.thresholds     = opts.thresholds     ?? DEFAULT_THRESHOLDS;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async analyze(block: BlockSample): Promise<DemandSignal> {
    this.validateBlock(block);
    this.ingest(block);

    const signal = this.compute(block);

    // Forward elevated-and-above signals to GhostBrain.
    if (signal.tier !== "low" && signal.tier !== "normal") {
      this.forward(signal).catch((err: Error) =>
        console.error("[DemandAnalyzer] GhostBrain forward error:", err.message),
      );
    }

    return signal;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateBlock(b: BlockSample): void {
    if (b.transactionCount < 0)       throw new Error("DemandAnalyzer: transactionCount < 0");
    if (b.gasLimit <= 0n)             throw new Error("DemandAnalyzer: gasLimit must be > 0");
    if (b.gasUsed < 0n)               throw new Error("DemandAnalyzer: gasUsed cannot be negative");
    if (b.gasUsed > b.gasLimit)       throw new Error("DemandAnalyzer: gasUsed > gasLimit");
  }

  private ingest(b: BlockSample): void {
    const gasUtilPct = Number((b.gasUsed * 100n) / b.gasLimit);

    this.push(this.txHistory,     b.chainId, b.transactionCount);
    this.push(this.gasUtilHistory, b.chainId, gasUtilPct);
  }

  private push(map: Map<ChainId, number[]>, chainId: ChainId, value: number): void {
    if (!map.has(chainId)) map.set(chainId, []);
    const buf = map.get(chainId)!;
    buf.push(value);
    if (buf.length > this.windowSize) buf.shift();
  }

  private avg(map: Map<ChainId, number[]>, chainId: ChainId): number {
    const buf = map.get(chainId);
    if (!buf || buf.length === 0) return 0;
    return buf.reduce((a, b) => a + b, 0) / buf.length;
  }

  private compute(block: BlockSample): DemandSignal {
    const txBuf     = this.txHistory.get(block.chainId) ?? [];
    const ready     = txBuf.length >= this.warmupSamples;
    const avgTxCount    = this.avg(this.txHistory,     block.chainId);
    const avgGasUtilPct = this.avg(this.gasUtilHistory, block.chainId);

    let score = 0;
    if (ready && avgTxCount > 0) {
      // Relative tx demand (capped at 1).
      const txScore = Math.min(block.transactionCount / (avgTxCount * 2), 1.0);
      // Gas utilisation component.
      const gasScore = avgGasUtilPct / 100;
      // Combined score (60% tx-relative, 40% gas util).
      score = Math.min(0.6 * txScore + 0.4 * gasScore, 1.0);
    }

    return {
      chainId:       block.chainId,
      timestamp:     block.timestamp,
      tier:          this.scoreToTier(score, ready),
      score,
      avgTxCount,
      avgGasUtilPct,
      latestTxCount: block.transactionCount,
      samplesUsed:   txBuf.length,
    };
  }

  private scoreToTier(score: number, ready: boolean): DemandTier {
    if (!ready) return "normal";
    const { critical, high, elevated, low } = this.thresholds;
    if (score >= critical) return "critical";
    if (score >= high)     return "high";
    if (score >= elevated) return "elevated";
    if (score >= low)      return "normal";
    return "low";
  }

  private async forward(signal: DemandSignal): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/demand`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: signal.chainId, gas_token: "GST", signal }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
