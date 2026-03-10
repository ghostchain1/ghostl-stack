/**
 * GhostChain Economic AI Engine — Burn Manager
 *
 * Accumulates GST burn candidates, computes the rolling burn rate, and
 * submits advisory burn proposals to the signing relay for governance
 * ratification.
 *
 * Burn categories:
 *   tx_fee_portion   — configurable fraction of every base fee
 *   failed_tx_fee    — full base fee from reverted transactions
 *   governance_vote  — explicit governance-mandated burn amounts
 *   slashing_penalty — validator slashing proceeds redirected to burn
 *
 * Advisory-only invariant:
 *   This module NEVER executes burns on-chain.  It accumulates candidates
 *   in an in-memory queue and, once the queue threshold is reached or a
 *   flush is requested, sends a single advisory proposal to the signing relay
 *   at /relay/supply/burn/propose.  The relay requires governance quorum.
 *
 * SECURITY:
 *   - All amounts are bigint (GST smallest unit).
 *   - Queue length is bounded to prevent unbounded memory growth.
 *   - Each candidate is validated (amount > 0, known category) before queuing.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export const BURN_CATEGORIES = [
  "tx_fee_portion",
  "failed_tx_fee",
  "governance_vote",
  "slashing_penalty",
] as const;
export type BurnCategory = (typeof BURN_CATEGORIES)[number];

export interface BurnCandidate {
  id:        string;     // deduplication key (e.g. txHash or governance proposalId)
  category:  BurnCategory;
  amountGst: bigint;     // must be > 0
  timestamp: number;     // Unix seconds
  chainId:   number;
}

export interface BurnProposal {
  timestamp:    number;
  totalGst:     bigint;
  candidateIds: string[];
  byCategory:   Record<BurnCategory, bigint>;
  burnRateGst:  bigint;   // GST per second (rolling)
  epochNumber:  number;
  chainId:      number;
}

export interface BurnRateSummary {
  chainId:      number;
  timestamp:    number;
  burnRateGst:  bigint;  // GST/second over the rolling window
  totalQueued:  bigint;
  queueDepth:   number;
  epochNumber:  number;
}

// ── BurnManager ──────────────────────────────────────────────────────────

export interface BurnManagerOptions {
  ghostbrainUrl?:   string;
  relayUrl?:        string;
  chainId?:         number;
  /** Max candidates in queue before blocking (default 1000). */
  maxQueueSize?:    number;
  /** Propose once this many candidates accumulate (default 100). */
  proposalThreshold?: number;
  /** Rolling window (seconds) for burn rate computation (default 3600). */
  rateWindowSec?:   number;
}

const MAX_QUEUE = 5000;
const MAX_RATE_WINDOW = 7 * 24 * 3600; // 1 week

export class BurnManager {
  private readonly ghostbrainUrl:     string;
  private readonly relayUrl:          string;
  private readonly chainId:           number;
  private readonly maxQueueSize:      number;
  private readonly proposalThreshold: number;
  private readonly rateWindowSec:     number;

  /** Pending candidates not yet proposed. */
  private readonly queue: BurnCandidate[] = [];
  /** Already-seen IDs to prevent double-queuing. */
  private readonly seen = new Set<string>();
  /** Recent completed-burn events for rate estimation. */
  private readonly rateHistory: Array<{ timestamp: number; amountGst: bigint }> = [];
  private readonly rateWindowMax: number;

  private epochNumber = 0;

  constructor(opts: BurnManagerOptions = {}) {
    this.ghostbrainUrl     = opts.ghostbrainUrl     ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl          = opts.relayUrl          ?? (process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910");
    this.chainId           = opts.chainId           ?? 14000101;
    this.maxQueueSize      = Math.min(opts.maxQueueSize      ?? 1000, MAX_QUEUE);
    this.proposalThreshold = opts.proposalThreshold ?? 100;
    this.rateWindowSec     = Math.min(opts.rateWindowSec     ?? 3600, MAX_RATE_WINDOW);
    this.rateWindowMax     = 10_000; // bounded rate-history entries
  }

  // ── Public API ────────────────────────────────────────────────────────────

  enqueue(candidate: BurnCandidate): boolean {
    this.validateCandidate(candidate);
    if (this.queue.length >= this.maxQueueSize) return false;
    if (this.seen.has(candidate.id)) return false;
    this.seen.add(candidate.id);
    this.queue.push(candidate);
    return true;
  }

  setEpoch(n: number): void {
    this.epochNumber = n;
  }

  async flush(nowSec: number = Math.floor(Date.now() / 1000)): Promise<BurnProposal | null> {
    if (this.queue.length === 0) return null;

    const proposal = this.buildProposal(nowSec);
    this.drainQueue(proposal);

    this.forward(proposal).catch((err: Error) =>
      console.error("[BurnManager] GhostBrain forward error:", err.message),
    );
    this.proposeToRelay(proposal).catch((err: Error) =>
      console.error("[BurnManager] relay proposal error:", err.message),
    );

    return proposal;
  }

  async tick(nowSec: number = Math.floor(Date.now() / 1000)): Promise<BurnProposal | null> {
    if (this.queue.length >= this.proposalThreshold) {
      return this.flush(nowSec);
    }
    return null;
  }

  rateSummary(nowSec: number = Math.floor(Date.now() / 1000)): BurnRateSummary {
    this.pruneRateHistory(nowSec);
    const rate = this.computeRate(nowSec);
    const totalQueued = this.queue.reduce((a, c) => a + c.amountGst, 0n);
    return {
      chainId:     this.chainId,
      timestamp:   nowSec,
      burnRateGst: rate,
      totalQueued,
      queueDepth:  this.queue.length,
      epochNumber: this.epochNumber,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateCandidate(c: BurnCandidate): void {
    if (!c.id) throw new Error("BurnManager: candidate id is empty");
    if (c.amountGst <= 0n) throw new Error("BurnManager: amountGst must be > 0");
    if (!(BURN_CATEGORIES as readonly string[]).includes(c.category))
      throw new Error(`BurnManager: unknown category "${c.category}"`);
  }

  private buildProposal(nowSec: number): BurnProposal {
    const byCategory = {} as Record<BurnCategory, bigint>;
    for (const cat of BURN_CATEGORIES) byCategory[cat] = 0n;

    let total = 0n;
    for (const c of this.queue) {
      byCategory[c.category] += c.amountGst;
      total += c.amountGst;
    }

    this.pruneRateHistory(nowSec);
    const rate = this.computeRate(nowSec);

    return {
      timestamp:    nowSec,
      totalGst:     total,
      candidateIds: this.queue.map(c => c.id),
      byCategory,
      burnRateGst:  rate,
      epochNumber:  this.epochNumber,
      chainId:      this.chainId,
    };
  }

  private drainQueue(proposal: BurnProposal): void {
    // Record in rate history.
    this.rateHistory.push({ timestamp: proposal.timestamp, amountGst: proposal.totalGst });
    if (this.rateHistory.length > this.rateWindowMax) this.rateHistory.shift();
    // Clear queue (deduplication set is kept to prevent re-queueing).
    this.queue.length = 0;
  }

  private pruneRateHistory(nowSec: number): void {
    const cutoff = nowSec - this.rateWindowSec;
    while (this.rateHistory.length > 0 && (this.rateHistory[0]?.timestamp ?? 0) < cutoff) {
      this.rateHistory.shift();
    }
  }

  private computeRate(nowSec: number): bigint {
    if (this.rateHistory.length === 0) return 0n;
    const windowSec = BigInt(
      Math.max(1, nowSec - (this.rateHistory[0]?.timestamp ?? nowSec)),
    );
    const total = this.rateHistory.reduce((a, r) => a + r.amountGst, 0n);
    return total / windowSec;  // GST per second
  }

  private serialise(p: BurnProposal): object {
    return {
      chain_id:    p.chainId,
      gas_token:   "GST",
      from:        "ghostbrain-economic-ai",
      timestamp:   p.timestamp,
      totalGst:    p.totalGst.toString(),
      byCategory:  Object.fromEntries(
        Object.entries(p.byCategory).map(([k, v]) => [k, (v as bigint).toString()]),
      ),
      burnRateGst:   p.burnRateGst.toString(),
      candidateIds:  p.candidateIds,
      epochNumber:   p.epochNumber,
    };
  }

  private async forward(p: BurnProposal): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/burn-rate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialise(p)),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async proposeToRelay(p: BurnProposal): Promise<void> {
    const resp = await fetch(`${this.relayUrl}/relay/supply/burn/propose`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialise(p)),
    });
    if (!resp.ok) throw new Error(`relay responded ${resp.status}`);
  }
}
