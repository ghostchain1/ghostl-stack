/**
 * GhostChain Economic AI Engine — Supply Controller
 *
 * Monitors GhostChain L1 total circulating supply of GST versus the
 * governance-set target supply and issues one of three advisory policy
 * signals:
 *
 *   expand   — supply is below target; recommend reducing burn rate / increasing issuance
 *   stable   — supply is within tolerance of target
 *   contract — supply is above target; recommend accelerating burn
 *
 * The controller also tracks per-epoch supply deltas to derive an
 * annualised inflation rate, which it forwards to GhostBrain Core.
 *
 * SECURITY:
 *   - All supply values are bigint (GST smallest unit).
 *   - This module NEVER mints or burns tokens.  All policy signals are
 *     advisory and forwarded to GhostBrain for governance consideration.
 *   - Buffer sizes are bounded.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type SupplyPolicy = "expand" | "stable" | "contract";

export interface SupplySnapshot {
  chainId:           number;
  timestamp:         number;
  circulatingSupply: bigint;  // GST smallest unit
  targetSupply:      bigint;  // governance-set target
  epochNumber:       number;
}

export interface SupplySignal {
  chainId:           number;
  timestamp:         number;
  policy:            SupplyPolicy;
  circulatingSupply: bigint;
  targetSupply:      bigint;
  /** Signed deviation from target: positive = oversupplied. */
  deviationGst:      bigint;
  /** Fractional deviation ∈ (-1, ∞); positive means excess supply. */
  deviationFrac:     number;
  /** Annualised inflation rate.  Negative = deflation. */
  annualisedInflation: number;
  confidence:        number;
}

// ── SupplyController ──────────────────────────────────────────────────────

export interface SupplyControllerOptions {
  ghostbrainUrl?: string;
  /** Target chain (must be L1 for supply authority). Default 14000101. */
  chainId?: number;
  /** Fraction of target within which policy is "stable" (default 0.02 = ±2 %). */
  stableBandFrac?: number;
  /** Rolling window of snapshots for inflation estimation. */
  windowSize?: number;
  /** Seconds per epoch (used for annualisation denominator). */
  epochDurationSec?: number;
  /** Epochs per year (default 8760 for 1-hour epochs). */
  epochsPerYear?: number;
}

const MAX_WINDOW  = 200;
const SECS_IN_YEAR = 365.25 * 24 * 3600;

export class SupplyController {
  private readonly ghostbrainUrl:    string;
  private readonly chainId:          number;
  private readonly stableBandFrac:   number;
  private readonly windowSize:       number;
  private readonly epochDurationSec: number;
  private readonly epochsPerYear:    number;

  private readonly snapshots: SupplySnapshot[] = [];

  constructor(opts: SupplyControllerOptions = {}) {
    this.ghostbrainUrl    = opts.ghostbrainUrl    ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.chainId          = opts.chainId          ?? 14000101;
    this.stableBandFrac   = opts.stableBandFrac   ?? 0.02;
    this.windowSize       = Math.min(opts.windowSize ?? 72, MAX_WINDOW);
    this.epochDurationSec = opts.epochDurationSec ?? 3600;
    this.epochsPerYear    = opts.epochsPerYear    ?? Math.round(SECS_IN_YEAR / (opts.epochDurationSec ?? 3600));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async observe(snap: SupplySnapshot): Promise<SupplySignal> {
    this.validate(snap);
    this.ingest(snap);

    const signal = this.compute(snap);

    this.forward(signal).catch((err: Error) =>
      console.error("[SupplyController] GhostBrain forward error:", err.message),
    );

    return signal;
  }

  latestSignal(): SupplySignal | null {
    if (this.snapshots.length === 0) return null;
    const last = this.snapshots[this.snapshots.length - 1]!;
    return this.compute(last);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validate(snap: SupplySnapshot): void {
    if (snap.circulatingSupply < 0n) throw new Error("SupplyController: circulatingSupply cannot be negative");
    if (snap.targetSupply      <= 0n) throw new Error("SupplyController: targetSupply must be > 0");
  }

  private ingest(snap: SupplySnapshot): void {
    this.snapshots.push(snap);
    if (this.snapshots.length > this.windowSize) this.snapshots.shift();
  }

  private compute(snap: SupplySnapshot): SupplySignal {
    const deviation     = snap.circulatingSupply - snap.targetSupply;
    const deviationFrac = snap.targetSupply > 0n
      ? Number(deviation) / Number(snap.targetSupply)
      : 0;

    const policy = this.derivePolicy(deviationFrac);
    const inflation = this.estimateInflation();
    const confidence = Math.min(this.snapshots.length / this.windowSize, 1.0);

    return {
      chainId:             snap.chainId,
      timestamp:           snap.timestamp,
      policy,
      circulatingSupply:   snap.circulatingSupply,
      targetSupply:        snap.targetSupply,
      deviationGst:        deviation,
      deviationFrac,
      annualisedInflation: inflation,
      confidence,
    };
  }

  private derivePolicy(deviationFrac: number): SupplyPolicy {
    if (deviationFrac > this.stableBandFrac)  return "contract";
    if (deviationFrac < -this.stableBandFrac) return "expand";
    return "stable";
  }

  /** Linear regression over epoch-supply pairs to estimate per-epoch growth rate. */
  private estimateInflation(): number {
    const n = this.snapshots.length;
    if (n < 2) return 0;
    const first = this.snapshots[0]!;
    const last  = this.snapshots[n - 1]!;

    const elapsedEpochs = Math.max(1, last.epochNumber - first.epochNumber);
    const supplyChange  = Number(last.circulatingSupply) - Number(first.circulatingSupply);
    const supplyBase    = Number(first.circulatingSupply);
    if (supplyBase === 0) return 0;

    const perEpochRate = supplyChange / (supplyBase * elapsedEpochs);
    return perEpochRate * this.epochsPerYear;  // annualise
  }

  private async forward(signal: SupplySignal): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/supply-signal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:           signal.chainId,
        gas_token:          "GST",
        policy:             signal.policy,
        circulatingSupply:  signal.circulatingSupply.toString(),
        targetSupply:       signal.targetSupply.toString(),
        deviationGst:       signal.deviationGst.toString(),
        deviationFrac:      signal.deviationFrac,
        annualisedInflation: signal.annualisedInflation,
        confidence:         signal.confidence,
        timestamp:          signal.timestamp,
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
