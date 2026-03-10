/**
 * GhostChain AI Validator Network — Block Analyzer
 *
 * Statistically analyzes each finalized block across L1/L2/L3 to surface:
 *   - Empty / near-empty blocks (possible validator censorship or downtime)
 *   - Suspiciously large blocks (possible spam / gas exhaustion attack)
 *   - Abnormal gas utilization relative to a rolling baseline
 *   - Duplicate validator proposers within a short window (possible equivocation)
 *
 * Results are forwarded to GhostBrain Core (:7900) and optionally emitted
 * to the AI event log for on-chain audit.
 *
 * Chain routing law: reads only from L1/L2/L3 RPCs; forwards only to
 * GhostBrain — never to external chains.
 * Gas token: GST.
 *
 * SECURITY:
 *   - All inputs are validated before arithmetic to prevent NaN poisoning.
 *   - The proposer deduplication window is bounded to prevent unbounded
 *     memory growth.
 */

import type { ChainId } from "./validator_monitor.js";

// ── Block type ─────────────────────────────────────────────────────────────

export interface GhostBlock {
  /** Chain this block belongs to. */
  chainId:       ChainId;
  height:         number;
  hash:           string;
  /** Hex-encoded proposer address. */
  proposerAddress: string;
  transactionCount: number;
  /** Total gas used in this block. */
  gasUsed:        bigint;
  /** Maximum gas allowed in this block. */
  gasLimit:       bigint;
  /** Unix epoch (seconds) of block finalization. */
  timestamp:      number;
}

export type BlockFinding =
  | "empty_block"
  | "near_empty_block"
  | "gas_exhaustion"
  | "gas_spike"
  | "proposer_repeat"
  | "normal";

export interface BlockAnalysis {
  chainId:         ChainId;
  height:          number;
  findings:        BlockFinding[];
  gasUtilPct:      number;   // gas_used / gas_limit * 100
  /** Ratio of gas_used to the rolling average. NaN when no baseline yet. */
  gasToBaselineRatio: number;
  proposerRepeat:  boolean;
  timestamp:       number;
}

// ── BlockAnalyzer ──────────────────────────────────────────────────────────

export interface BlockAnalyzerOptions {
  ghostbrainUrl?: string;
  /** Percentage of gas_limit at or below which a block is "near-empty". */
  nearEmptyGasPct?: number;
  /** Percentage of gas_limit at or above which the block is "gas exhaustion". */
  gasExhaustionPct?: number;
  /** Ratio of gas_used / rolling_average that triggers a "gas spike" finding. */
  gasSpikeRatio?: number;
  /** Size of the rolling baseline window (number of blocks). */
  baselineWindow?: number;
  /** Max blocks tracked per chain to detect proposer repeats within. */
  proposerWindowBlocks?: number;
  /** How many times a proposer must appear in the window to trigger a finding. */
  proposerRepeatThreshold?: number;
}

export class BlockAnalyzer {
  private readonly ghostbrainUrl:           string;
  private readonly nearEmptyGasPct:         number;
  private readonly gasExhaustionPct:        number;
  private readonly gasSpikeRatio:           number;
  private readonly baselineWindow:          number;
  private readonly proposerWindowBlocks:    number;
  private readonly proposerRepeatThreshold: number;

  /**
   * Rolling sample of gas_used values per chain, for baseline calculation.
   * Key: chainId.
   */
  private readonly gasHistory = new Map<ChainId, bigint[]>();

  /**
   * Recent proposer ring-buffer per chain.
   * Key: chainId  Value: [proposerAddress, height][]
   */
  private readonly proposerHistory = new Map<ChainId, Array<[string, number]>>();

  constructor(opts: BlockAnalyzerOptions = {}) {
    this.ghostbrainUrl           = opts.ghostbrainUrl           ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.nearEmptyGasPct         = opts.nearEmptyGasPct         ?? 1;
    this.gasExhaustionPct        = opts.gasExhaustionPct        ?? 95;
    this.gasSpikeRatio           = opts.gasSpikeRatio           ?? 3.0;
    this.baselineWindow          = opts.baselineWindow          ?? 100;
    this.proposerWindowBlocks    = opts.proposerWindowBlocks    ?? 20;
    this.proposerRepeatThreshold = opts.proposerRepeatThreshold ?? 3;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Analyze one finalized block.  Updates internal baselines and returns
   * a structured analysis.  If noteworthy findings exist, forwards them
   * to GhostBrain.
   */
  async analyze(block: GhostBlock): Promise<BlockAnalysis> {
    this.validateBlock(block);

    const findings:   BlockFinding[] = [];
    const gasUtilPct = this.gasUtilPct(block);

    // ── Gas-based findings ────────────────────────────────────────────────

    if (block.transactionCount === 0) {
      findings.push("empty_block");
    } else if (gasUtilPct <= this.nearEmptyGasPct) {
      findings.push("near_empty_block");
    }

    if (gasUtilPct >= this.gasExhaustionPct) {
      findings.push("gas_exhaustion");
    }

    const gasToBaselineRatio = this.computeGasRatio(block);
    if (!Number.isNaN(gasToBaselineRatio) && gasToBaselineRatio >= this.gasSpikeRatio) {
      findings.push("gas_spike");
    }

    // Update rolling gas baseline.
    this.updateGasHistory(block);

    // ── Proposer-repeat detection ─────────────────────────────────────────

    const proposerRepeat = this.detectProposerRepeat(block);
    if (proposerRepeat) {
      findings.push("proposer_repeat");
    }

    if (findings.length === 0) findings.push("normal");

    const analysis: BlockAnalysis = {
      chainId:            block.chainId,
      height:             block.height,
      findings,
      gasUtilPct,
      gasToBaselineRatio: Number.isNaN(gasToBaselineRatio) ? -1 : gasToBaselineRatio,
      proposerRepeat,
      timestamp:          block.timestamp,
    };

    const anomalous = findings.some(f => f !== "normal" && f !== "near_empty_block");
    if (anomalous) {
      this.forwardAnalysis(analysis).catch((err: Error) =>
        console.error("[BlockAnalyzer] GhostBrain forward error:", err.message),
      );
    }

    return analysis;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private validateBlock(block: GhostBlock): void {
    if (block.gasLimit <= 0n) throw new Error("BlockAnalyzer: gasLimit must be > 0");
    if (block.gasUsed < 0n)   throw new Error("BlockAnalyzer: gasUsed cannot be negative");
    if (block.gasUsed > block.gasLimit) throw new Error("BlockAnalyzer: gasUsed > gasLimit");
  }

  private gasUtilPct(block: GhostBlock): number {
    return Number((block.gasUsed * 10000n) / block.gasLimit) / 100;
  }

  private computeGasRatio(block: GhostBlock): number {
    const history = this.gasHistory.get(block.chainId);
    if (!history || history.length === 0) return NaN;

    const sum     = history.reduce((a, b) => a + b, 0n);
    const avg     = Number(sum) / history.length;
    if (avg === 0) return NaN;
    return Number(block.gasUsed) / avg;
  }

  private updateGasHistory(block: GhostBlock): void {
    if (!this.gasHistory.has(block.chainId)) {
      this.gasHistory.set(block.chainId, []);
    }
    const history = this.gasHistory.get(block.chainId)!;
    history.push(block.gasUsed);
    if (history.length > this.baselineWindow) history.shift();
  }

  private detectProposerRepeat(block: GhostBlock): boolean {
    if (!this.proposerHistory.has(block.chainId)) {
      this.proposerHistory.set(block.chainId, []);
    }
    const window = this.proposerHistory.get(block.chainId)!;

    // Trim to the recent window.
    const minHeight = block.height - this.proposerWindowBlocks;
    while (window.length > 0 && window[0]![1] < minHeight) window.shift();

    // Count appearances of this proposer.
    const count = window.filter(([addr]) => addr === block.proposerAddress).length;
    window.push([block.proposerAddress, block.height]);

    return count >= this.proposerRepeatThreshold;
  }

  private async forwardAnalysis(analysis: BlockAnalysis): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/block-analysis`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: analysis.chainId, gas_token: "GST", analysis }),
    });
    if (!resp.ok) {
      throw new Error(`GhostBrain responded ${resp.status}`);
    }
  }
}
