/**
 * GhostChain AI Validator Network — Stake Optimizer
 *
 * Analyzes the current stake distribution across the GhostChain
 * validator set and generates advisory stake-redistribution proposals.
 *
 * Goals:
 *   1. Nakamoto Coefficient maximization — spread stake to increase the
 *      minimum number of validators required for a 33%+ attack.
 *   2. Regional diversity — enforce the MAX_REGION_FRACTION invariant
 *      (≤50% of total stake in any one region).
 *   3. Decentralization score — measure and trend the Herfindahl-Hirschman
 *      Index (HHI) of stake concentration.
 *
 * SAFETY INVARIANTS
 * -----------------
 * 1. Produces advisory proposals only — never moves stake autonomously.
 * 2. A single proposal may not recommend moving more than
 *    MAX_SINGLE_MOVE_FRACTION of total stake per validator pair.
 * 3. The optimizer never recommends moving stake to a jailed or offline
 *    validator.
 *
 * Chain routing law: L1 (chain_id 14000101).  Gas token: GST.
 */

import type { ChainId, ValidatorRecord, ValidatorStatus } from "../monitor/validator_monitor.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StakeSnapshot {
  chainId:    ChainId;
  timestamp:  number;
  validators: ValidatorRecord[];
}

export interface StakeOptimizationReport {
  chainId:            ChainId;
  timestamp:          number;
  /** Nakamoto coefficient: minimum validators controlling ≥33% of stake. */
  nakamotoCoefficient: number;
  /**
   * Herfindahl-Hirschman Index (0-10000).
   *   <1000 = decentralized, 1000-2500 = moderate, >2500 = concentrated.
   */
  hhiScore:           number;
  /** Highest fraction of stake held by a single region (0-1). */
  maxRegionFraction:  number;
  /** True when the distribution is acceptable — no proposal needed. */
  healthy:            boolean;
  proposals: Array<{
    type:        "stake_move" | "jailed_unbond" | "region_rebalance";
    from:        string;
    to:          string;
    /** Fraction of total stake suggested to move (capped). */
    fraction:    number;
    reason:      string;
  }>;
}

// ── StakeOptimizer ────────────────────────────────────────────────────────

export interface StakeOptimizerOptions {
  ghostbrainUrl?: string;
  /** Maximum fraction of total stake any proposal may move in one step. */
  maxSingleMoveFraction?: number;
  /** HHI threshold above which concentration proposals are generated. */
  hhiConcentrationThreshold?: number;
  /** Maximum allowed fraction for any single region (0-1). */
  maxRegionFraction?: number;
  /** Statuses considered "eligible" to receive delegated stake. */
  eligibleStatuses?: ValidatorStatus[];
}

const INELIGIBLE_STATUSES: ValidatorStatus[] = ["jailed", "offline"];

export class StakeOptimizer {
  private readonly ghostbrainUrl:             string;
  private readonly maxSingleMoveFraction:     number;
  private readonly hhiConcentrationThreshold: number;
  private readonly maxRegionFraction:         number;
  private readonly eligibleStatuses:          ValidatorStatus[];

  constructor(opts: StakeOptimizerOptions = {}) {
    this.ghostbrainUrl             = opts.ghostbrainUrl             ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.maxSingleMoveFraction     = opts.maxSingleMoveFraction     ?? 0.03;
    this.hhiConcentrationThreshold = opts.hhiConcentrationThreshold ?? 2500;
    this.maxRegionFraction         = opts.maxRegionFraction         ?? 0.50;
    this.eligibleStatuses          = opts.eligibleStatuses          ?? ["online"];
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async optimize(snapshot: StakeSnapshot): Promise<StakeOptimizationReport> {
    const { chainId, timestamp, validators } = snapshot;
    const totalStake = validators.reduce((s, v) => s + v.votingPower, 0n);

    if (totalStake === 0n || validators.length === 0) {
      return this.emptyReport(chainId, timestamp);
    }

    const nakamoto        = this.computeNakamoto(validators, totalStake);
    const hhi             = this.computeHHI(validators, totalStake);
    const maxRegionFrac   = this.computeMaxRegionFraction(validators, totalStake);

    const proposals: StakeOptimizationReport["proposals"] = [];

    // ── Jailed / offline validator unbonding proposals ─────────────────────
    for (const v of validators) {
      if (INELIGIBLE_STATUSES.includes(v.status) && v.votingPower > 0n) {
        const bestTarget = this.pickBestTarget(validators, v.address);
        if (bestTarget) {
          proposals.push({
            type:     "jailed_unbond",
            from:     v.address,
            to:       bestTarget.address,
            fraction: Math.min(
              Number(v.votingPower) / Number(totalStake),
              this.maxSingleMoveFraction,
            ),
            reason: `${v.moniker} is ${v.status} — redirect stake to active validator`,
          });
        }
      }
    }

    // ── HHI concentration reduction ───────────────────────────────────────
    if (hhi > this.hhiConcentrationThreshold) {
      const sorted = [...validators]
        .filter(v => this.eligibleStatuses.includes(v.status))
        .sort((a, b) => Number(b.votingPower - a.votingPower));

      const topHeavy = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1)));
      const lightest = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.25)));

      for (const heavy of topHeavy) {
        const target = lightest.find(l => l.address !== heavy.address);
        if (!target) continue;
        proposals.push({
          type:     "stake_move",
          from:     heavy.address,
          to:       target.address,
          fraction: this.maxSingleMoveFraction,
          reason:   `HHI concentration (${hhi}) above threshold — reduce top-heavy stake`,
        });
      }
    }

    // ── Regional rebalance ────────────────────────────────────────────────
    if (maxRegionFrac > this.maxRegionFraction) {
      const byRegion = this.groupByRegion(validators);
      const overRegion = [...byRegion.entries()].find(([, vs]) => {
        const regionStake = vs.reduce((s, v) => s + v.votingPower, 0n);
        return Number(regionStake) / Number(totalStake) > this.maxRegionFraction;
      });

      if (overRegion) {
        const [regionLabel, overValidators] = overRegion;
        const underValidators = validators.filter(v => {
          const region = v.meta["region"] ?? "unknown";
          return region !== regionLabel && this.eligibleStatuses.includes(v.status);
        });

        const target = underValidators.sort(
          (a, b) => Number(a.votingPower - b.votingPower)
        )[0];

        if (target) {
          const heaviest = overValidators.sort(
            (a, b) => Number(b.votingPower - a.votingPower)
          )[0];
          if (heaviest) {
            proposals.push({
              type:     "region_rebalance",
              from:     heaviest.address,
              to:       target.address,
              fraction: this.maxSingleMoveFraction,
              reason:   `Region '${regionLabel}' exceeds max fraction (${(maxRegionFrac * 100).toFixed(1)}%)`,
            });
          }
        }
      }
    }

    const healthy    = proposals.length === 0;
    const report: StakeOptimizationReport = {
      chainId, timestamp,
      nakamotoCoefficient: nakamoto,
      hhiScore:            hhi,
      maxRegionFraction:   maxRegionFrac,
      healthy, proposals,
    };

    if (!healthy) {
      this.forwardReport(report).catch((err: Error) =>
        console.error("[StakeOptimizer] GhostBrain forward error:", err.message),
      );
    }

    return report;
  }

  // ── Metrics computation ───────────────────────────────────────────────────

  /**
   * Nakamoto coefficient: minimum count of validators whose combined
   * stake exceeds 33% of total.
   */
  private computeNakamoto(validators: ValidatorRecord[], total: bigint): number {
    const sorted = [...validators].sort((a, b) =>
      Number(b.votingPower - a.votingPower)
    );
    let sum   = 0n;
    let count = 0;
    const threshold = total / 3n;
    for (const v of sorted) {
      sum += v.votingPower;
      count++;
      if (sum > threshold) break;
    }
    return count;
  }

  /**
   * Herfindahl-Hirschman Index: sum of squared market-share percentages.
   * Range: 0 (perfect equality) → 10000 (monopoly).
   */
  private computeHHI(validators: ValidatorRecord[], total: bigint): number {
    return validators.reduce((hhi, v) => {
      const share = Number(v.votingPower * 10000n) / Number(total);
      return hhi + (share / 100) ** 2 * 100;
    }, 0);
  }

  private computeMaxRegionFraction(validators: ValidatorRecord[], total: bigint): number {
    const byRegion = this.groupByRegion(validators);
    let max = 0;
    for (const [, vs] of byRegion) {
      const regionStake = vs.reduce((s, v) => s + v.votingPower, 0n);
      const frac = Number(regionStake) / Number(total);
      if (frac > max) max = frac;
    }
    return max;
  }

  private groupByRegion(
    validators: ValidatorRecord[],
  ): Map<string, ValidatorRecord[]> {
    const m = new Map<string, ValidatorRecord[]>();
    for (const v of validators) {
      const r = v.meta["region"] ?? "unknown";
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(v);
    }
    return m;
  }

  private pickBestTarget(
    validators:  ValidatorRecord[],
    excludeAddr: string,
  ): ValidatorRecord | undefined {
    return [...validators]
      .filter(v => v.address !== excludeAddr && this.eligibleStatuses.includes(v.status))
      .sort((a, b) => Number(a.votingPower - b.votingPower))[0];
  }

  private emptyReport(chainId: ChainId, timestamp: number): StakeOptimizationReport {
    return {
      chainId, timestamp,
      nakamotoCoefficient: 0,
      hhiScore:            0,
      maxRegionFraction:   0,
      healthy:             true,
      proposals:           [],
    };
  }

  private async forwardReport(r: StakeOptimizationReport): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/stake-optimization`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: r.chainId, gas_token: "GST", report: r }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
