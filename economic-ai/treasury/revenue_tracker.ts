/**
 * GhostChain Economic AI Engine — Revenue Tracker
 *
 * Aggregates inbound revenue into epoch-scoped buckets per chain and
 * per category, computes rolling inflow rates, and forwards summaries
 * to GhostBrain Core (:7900).
 *
 * Revenue categories:
 *   validator_fees  — block-proposer fees paid by tx senders (GST)
 *   burn_redirect   — portion of base fee redirected from burn to treasury
 *   l2_fees         — sequencer revenue from GhostL2
 *   l3_fees         — sequencer revenue from GhostL3
 *   slashing        — slashed-validator penalty funds
 *   grants          — governance-voted grants received by the treasury
 *
 * Epoch structure:
 *   Epoch N spans [epochStart + N*epochDuration, epochStart + (N+1)*epochDuration).
 *   Revenue events received mid-epoch are accumulated into the current epoch.
 *   At epoch close the bucket is sealed and a summary is forwarded.
 *
 * SECURITY:
 *   - All amounts are bigint (GST smallest unit).  No floating-point accumulation.
 *   - Category keys are validated against the allowlist before insertion.
 *   - No autonomous fund movement is performed.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;
export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const REVENUE_CATEGORIES = [
  "validator_fees",
  "burn_redirect",
  "l2_fees",
  "l3_fees",
  "slashing",
  "grants",
] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export interface RevenueEvent {
  chainId:   ChainId;
  category:  RevenueCategory;
  amountGst: bigint;    // must be > 0
  timestamp: number;    // Unix seconds
}

export interface EpochRevenueSummary {
  epochNumber:   number;
  chainId:       ChainId;
  epochStart:    number;
  epochEnd:      number;
  totalGst:      bigint;
  byCategory:    Record<RevenueCategory, bigint>;
  inflowRateGst: bigint;  // GST per second over epoch duration
  eventCount:    number;
}

// ── RevenueTracker ────────────────────────────────────────────────────────

export interface RevenueTrackerOptions {
  ghostbrainUrl?: string;
  /** Epoch duration in seconds (default: 3600 = 1 hour). */
  epochDurationSec?: number;
  /** Epoch origin (Unix seconds; default: first event seen). */
  epochOrigin?: number;
  /** Number of sealed epoch summaries to retain in memory. */
  maxHistoricalEpochs?: number;
}

const MAX_HISTORICAL_EPOCHS = 200;

function emptyByCategory(): Record<RevenueCategory, bigint> {
  return {
    validator_fees: 0n,
    burn_redirect:  0n,
    l2_fees:        0n,
    l3_fees:        0n,
    slashing:       0n,
    grants:         0n,
  };
}

export class RevenueTracker {
  private readonly ghostbrainUrl:     string;
  private readonly epochDurationSec:  number;
  private readonly maxHistorical:     number;

  /** Unix-second origin of epoch 0. Set on first event if not configured. */
  private epochOrigin: number | null;

  /** Accumulated revenue for the open epoch, per chain. */
  private readonly openBuckets = new Map<ChainId, {
    epochNumber: number;
    epochStart:  number;
    totalGst:    bigint;
    byCategory:  Record<RevenueCategory, bigint>;
    eventCount:  number;
  }>();

  /** Sealed historical summaries. */
  private readonly history: EpochRevenueSummary[] = [];

  constructor(opts: RevenueTrackerOptions = {}) {
    this.ghostbrainUrl    = opts.ghostbrainUrl  ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.epochDurationSec = opts.epochDurationSec ?? 3600;
    this.epochOrigin      = opts.epochOrigin ?? null;
    this.maxHistorical    = Math.min(opts.maxHistoricalEpochs ?? 48, MAX_HISTORICAL_EPOCHS);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  record(event: RevenueEvent): void {
    this.validateEvent(event);

    // Initialise epoch origin on first event.
    if (this.epochOrigin === null) this.epochOrigin = event.timestamp;

    const epochNum = this.epochOf(event.timestamp);
    this.ensureBucket(event.chainId, epochNum, this.epochStart(epochNum));
    this.accumulate(event);
  }

  /**
   * Seal any epoch whose end-time has passed.  Call periodically (e.g. every
   * minute) from the coordinator.
   */
  async flushExpiredEpochs(nowSec: number = Math.floor(Date.now() / 1000)): Promise<EpochRevenueSummary[]> {
    const sealed: EpochRevenueSummary[] = [];
    for (const [chainId, bucket] of this.openBuckets) {
      const epochEnd = bucket.epochStart + this.epochDurationSec;
      if (nowSec >= epochEnd) {
        const summary = this.seal(chainId, bucket, epochEnd);
        sealed.push(summary);
        this.openBuckets.delete(chainId);
        this.forward(summary).catch((err: Error) =>
          console.error("[RevenueTracker] GhostBrain forward error:", err.message),
        );
      }
    }
    return sealed;
  }

  snapshot(): Map<ChainId, EpochRevenueSummary | null> {
    const out = new Map<ChainId, EpochRevenueSummary | null>();
    for (const [chainId, bucket] of this.openBuckets) {
      const elapsed = Math.max(1, Math.floor(Date.now() / 1000) - bucket.epochStart);
      out.set(chainId, {
        epochNumber:   bucket.epochNumber,
        chainId,
        epochStart:    bucket.epochStart,
        epochEnd:      bucket.epochStart + this.epochDurationSec,
        totalGst:      bucket.totalGst,
        byCategory:    { ...bucket.byCategory },
        inflowRateGst: bucket.totalGst / BigInt(elapsed),
        eventCount:    bucket.eventCount,
      });
    }
    return out;
  }

  historicalSummaries(): EpochRevenueSummary[] {
    return [...this.history];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateEvent(e: RevenueEvent): void {
    if (e.amountGst <= 0n)
      throw new Error("RevenueTracker: amountGst must be > 0");
    if (!(REVENUE_CATEGORIES as readonly string[]).includes(e.category))
      throw new Error(`RevenueTracker: unknown category "${e.category}"`);
  }

  private epochOf(timestamp: number): number {
    const origin = this.epochOrigin ?? timestamp;
    return Math.floor((timestamp - origin) / this.epochDurationSec);
  }

  private epochStart(epochNum: number): number {
    return (this.epochOrigin ?? 0) + epochNum * this.epochDurationSec;
  }

  private ensureBucket(chainId: ChainId, epochNum: number, epochStart: number): void {
    if (!this.openBuckets.has(chainId)) {
      this.openBuckets.set(chainId, {
        epochNumber: epochNum,
        epochStart,
        totalGst:    0n,
        byCategory:  emptyByCategory(),
        eventCount:  0,
      });
    }
  }

  private accumulate(event: RevenueEvent): void {
    const bucket = this.openBuckets.get(event.chainId);
    if (!bucket) return;
    bucket.totalGst              += event.amountGst;
    bucket.byCategory[event.category] += event.amountGst;
    bucket.eventCount++;
  }

  private seal(
    chainId: ChainId,
    bucket: { epochNumber: number; epochStart: number; totalGst: bigint; byCategory: Record<RevenueCategory, bigint>; eventCount: number },
    epochEnd: number,
  ): EpochRevenueSummary {
    const elapsed = Math.max(1, epochEnd - bucket.epochStart);
    const summary: EpochRevenueSummary = {
      epochNumber:   bucket.epochNumber,
      chainId,
      epochStart:    bucket.epochStart,
      epochEnd,
      totalGst:      bucket.totalGst,
      byCategory:    { ...bucket.byCategory },
      inflowRateGst: bucket.totalGst / BigInt(elapsed),
      eventCount:    bucket.eventCount,
    };
    this.history.push(summary);
    if (this.history.length > this.maxHistorical) this.history.shift();
    return summary;
  }

  private async forward(summary: EpochRevenueSummary): Promise<void> {
    // Serialise bigints to strings for JSON transport.
    const payload = {
      chain_id:  summary.chainId,
      gas_token: "GST",
      epochNumber:   summary.epochNumber,
      epochStart:    summary.epochStart,
      epochEnd:      summary.epochEnd,
      totalGst:      summary.totalGst.toString(),
      byCategory:    Object.fromEntries(
        Object.entries(summary.byCategory).map(([k, v]) => [k, (v as bigint).toString()]),
      ),
      inflowRateGst: summary.inflowRateGst.toString(),
      eventCount:    summary.eventCount,
    };
    const resp = await fetch(`${this.ghostbrainUrl}/econ/revenue`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
