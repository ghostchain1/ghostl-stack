/**
 * GhostChain AI Validator Network — Validator Balancer
 *
 * Analyzes real-time load across the validator set and produces
 * advisory rebalancing recommendations for GhostBrain Core.
 *
 * "Load" in the validator context means:
 *   - block-proposal frequency (frequency of being elected leader)
 *   - transaction validation throughput (txs/s processed)
 *   - peer connection count (network fan-out load)
 *   - memory + CPU utilisation (if reported via telemetry)
 *
 * SAFETY INVARIANTS
 * -----------------
 * 1. This module NEVER adjusts stake or reorders the validator set directly.
 * 2. All recommendations are advisory — consumed by GhostBrain and forwarded
 *    to the signing relay for governance ratification.
 * 3. Recommendations are bounded: no single move shifts more than
 *    MAX_PROPOSAL_FRACTION of total voting power.
 *
 * Chain routing law: advisory only.  Gas token: GST.
 */

import type { ChainId, ValidatorRecord } from "../monitor/validator_monitor.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidatorLoad {
  address:          string;
  chainId:          ChainId;
  /** Blocks proposed in the current observation window. */
  blocksProposed:   number;
  /** Transactions processed per second (rolling average). */
  txThroughputTps:  number;
  /** Active peer connections. */
  peerCount:        number;
  /** CPU usage 0-100. */
  cpuPct?:          number;
  /** Memory usage 0-100. */
  memPct?:          number;
}

export interface BalanceRecommendation {
  chainId:     ChainId;
  timestamp:   number;
  /** Composite load score ∈ [0,1] for each validator (1 = heaviest). */
  loadScores:  Array<{ address: string; score: number }>;
  /**
   * Suggested delegation shifts: move delegation FROM overloaded validators
   * TOWARD underloaded ones.
   */
  shifts: Array<{
    from:       string;
    to:         string;
    /** Fraction of total stake to suggest moving (0-MAX_PROPOSAL_FRACTION). */
    fraction:   number;
    reason:     string;
  }>;
  /** True when load variance is within the acceptable band — no action needed. */
  balanced:    boolean;
}

// ── ValidatorBalancer ─────────────────────────────────────────────────────

export interface ValidatorBalancerOptions {
  ghostbrainUrl?: string;
  /** Load imbalance threshold (score difference) that triggers a recommendation. */
  imbalanceThreshold?: number;
  /**
   * Maximum fraction of total stake that a single recommendation may
   * propose to move.  Prevents destabilising large stake shifts.
   */
  maxProposalFraction?: number;
  /** Weights for the composite load score (all positive, need not sum to 1). */
  weights?: {
    blocksProposed:  number;
    txThroughputTps: number;
    peerCount:       number;
    cpuPct:          number;
    memPct:          number;
  };
}

const DEFAULT_WEIGHTS = {
  blocksProposed:  1.5,
  txThroughputTps: 1.2,
  peerCount:       0.8,
  cpuPct:          1.0,
  memPct:          0.6,
};

export class ValidatorBalancer {
  private readonly ghostbrainUrl:      string;
  private readonly imbalanceThreshold: number;
  private readonly maxProposalFraction: number;
  private readonly weights: typeof DEFAULT_WEIGHTS;

  constructor(opts: ValidatorBalancerOptions = {}) {
    this.ghostbrainUrl       = opts.ghostbrainUrl       ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.imbalanceThreshold  = opts.imbalanceThreshold  ?? 0.30;
    this.maxProposalFraction = opts.maxProposalFraction ?? 0.05;
    this.weights             = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Given a snapshot of per-validator load metrics, compute a balance
   * recommendation and forward it to GhostBrain if rebalancing is advised.
   */
  async rebalance(
    loads:      ValidatorLoad[],
    validators: ValidatorRecord[],
  ): Promise<BalanceRecommendation> {
    if (loads.length === 0) {
      return this.emptyRecommendation(14000101 as ChainId);
    }

    const chainId    = loads[0]!.chainId;
    const scoreMap   = this.computeScores(loads);
    const loadScores = [...scoreMap.entries()]
      .map(([address, score]) => ({ address, score }))
      .sort((a, b) => b.score - a.score);

    const maxScore = loadScores[0]?.score ?? 0;
    const minScore = loadScores[loadScores.length - 1]?.score ?? 0;

    if (maxScore - minScore < this.imbalanceThreshold) {
      return {
        chainId, timestamp: Date.now(), loadScores, shifts: [], balanced: true,
      };
    }

    // Build stake lookup for the fraction cap.
    const totalStake = validators.reduce((s, v) => s + v.votingPower, 0n);

    // Pair overloaded (top quartile) with underloaded (bottom quartile).
    const q = Math.max(1, Math.floor(loadScores.length / 4));
    const overloaded  = loadScores.slice(0, q);
    const underloaded = loadScores.slice(-(q));

    const shifts: BalanceRecommendation["shifts"] = [];

    for (const heavy of overloaded) {
      const light = underloaded.find(u => {
        // Don't suggest self-shifts or already-referenced targets.
        if (u.address === heavy.address) return false;
        if (shifts.some(s => s.to === u.address)) return false;
        return true;
      });
      if (!light) continue;

      // Fraction: proportional to load gap, capped at maxProposalFraction.
      const gap      = heavy.score - light.score;
      const fraction = Math.min(gap * 0.1, this.maxProposalFraction);

      // Additional cap: never move more than 5% of total stake per recommendation.
      const heavyRecord = validators.find(v => v.address === heavy.address);
      const maxStakeFraction = heavyRecord && totalStake > 0n
        ? Number((heavyRecord.votingPower * 100n) / totalStake) / 100
        : this.maxProposalFraction;

      shifts.push({
        from:     heavy.address,
        to:       light.address,
        fraction: Math.min(fraction, maxStakeFraction, this.maxProposalFraction),
        reason:   `Load gap: ${heavy.address.slice(0,8)}…(${(heavy.score * 100).toFixed(0)}%) → ${light.address.slice(0,8)}…(${(light.score * 100).toFixed(0)}%)`,
      });
    }

    const rec: BalanceRecommendation = {
      chainId, timestamp: Date.now(), loadScores, shifts, balanced: false,
    };

    if (shifts.length > 0) {
      this.forwardRecommendation(rec).catch((err: Error) =>
        console.error("[ValidatorBalancer] GhostBrain forward error:", err.message),
      );
    }

    return rec;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Compute a composite load score for each validator.
   * Normalizes each metric to [0,1] relative to the current cohort max before
   * applying weights, to prevent one metric from dominating.
   */
  private computeScores(loads: ValidatorLoad[]): Map<string, number> {
    const maxByMetric = {
      blocksProposed:  Math.max(...loads.map(l => l.blocksProposed), 1),
      txThroughputTps: Math.max(...loads.map(l => l.txThroughputTps), 1),
      peerCount:       Math.max(...loads.map(l => l.peerCount), 1),
      cpuPct:          Math.max(...loads.map(l => l.cpuPct ?? 0), 1),
      memPct:          Math.max(...loads.map(l => l.memPct ?? 0), 1),
    };

    const totalWeight = Object.values(this.weights).reduce((a, b) => a + b, 0);
    const scores      = new Map<string, number>();

    for (const l of loads) {
      const norm = {
        blocksProposed:  l.blocksProposed  / maxByMetric.blocksProposed,
        txThroughputTps: l.txThroughputTps / maxByMetric.txThroughputTps,
        peerCount:       l.peerCount       / maxByMetric.peerCount,
        cpuPct:          (l.cpuPct ?? 0)   / maxByMetric.cpuPct,
        memPct:          (l.memPct ?? 0)   / maxByMetric.memPct,
      };

      const score = (
        this.weights.blocksProposed  * norm.blocksProposed  +
        this.weights.txThroughputTps * norm.txThroughputTps +
        this.weights.peerCount       * norm.peerCount       +
        this.weights.cpuPct          * norm.cpuPct          +
        this.weights.memPct          * norm.memPct
      ) / totalWeight;

      scores.set(l.address, score);
    }

    return scores;
  }

  private emptyRecommendation(chainId: ChainId): BalanceRecommendation {
    return { chainId, timestamp: Date.now(), loadScores: [], shifts: [], balanced: true };
  }

  private async forwardRecommendation(r: BalanceRecommendation): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/balance-recommendation`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: r.chainId, gas_token: "GST", recommendation: r }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
