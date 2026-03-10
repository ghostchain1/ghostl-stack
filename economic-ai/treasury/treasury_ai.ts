/**
 * GhostChain Economic AI Engine — Treasury AI
 *
 * Analyses treasury balances and revenue flows and submits advisory
 * allocation proposals to the signing relay for governance ratification.
 *
 * Allocation categories:
 *   rd_reserve        — R&D / protocol-improvement reserve
 *   validator_rewards — direct reward supplement to stakers
 *   burn              — buy-back-and-burn of GST (deflationary)
 *   ecosystem_fund    — grant-pool for builders in the Ghost ecosystem
 *   safety_reserve    — insurance fund for protocol emergencies
 *
 * Advisory-only invariant:
 *   This module NEVER touches funds directly.  All proposals are sent to
 *   the signing relay at /relay/treasury/propose.  The relay requires
 *   governance quorum before submitting any on-chain transaction.
 *
 * SECURITY:
 *   - All balance and amount fields are bigint (GST smallest unit).
 *   - Allocation percentages are validated to sum to exactly 100.
 *   - Minimum treasury balance is enforced before any allocation proposal.
 */

import type { EpochRevenueSummary } from "./revenue_tracker.js";

// ── Types ──────────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;
export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const ALLOC_CATEGORIES = [
  "rd_reserve",
  "validator_rewards",
  "burn",
  "ecosystem_fund",
  "safety_reserve",
] as const;
export type AllocCategory = (typeof ALLOC_CATEGORIES)[number];

export type AllocationPct = Record<AllocCategory, number>;

/** Current state submitted by the chain poller / integration layer. */
export interface TreasuryState {
  chainId:       ChainId;
  timestamp:     number;
  balanceGst:    bigint;  // total treasury balance in GST smallest unit
  /** Pending liabilities (e.g. scheduled grant payments). */
  liabilitiesGst: bigint;
}

export interface AllocationProposal {
  chainId:         ChainId;
  timestamp:       number;
  balanceGst:      bigint;
  netBalanceGst:   bigint;  // balance - liabilities
  allocations:     Record<AllocCategory, bigint>;   // GST amounts per category
  allocationPct:   AllocationPct;
  triggerReason:   string;
  confidence:      number;  // 0-1
}

// ── TreasuryAI ────────────────────────────────────────────────────────────

export interface TreasuryAIOptions {
  ghostbrainUrl?:  string;
  relayUrl?:       string;
  /** Minimum net balance before any proposal is emitted (default: 1 000 000 GST). */
  minNetBalanceGst?: bigint;
  /** Number of revenue summaries to keep for rate estimation. */
  historicalEpochs?: number;
  /** Allocation percentages (must sum to 100). */
  allocationPct?: AllocationPct;
}

const DEFAULT_ALLOC: AllocationPct = {
  rd_reserve:        20,
  validator_rewards: 35,
  burn:              15,
  ecosystem_fund:    20,
  safety_reserve:    10,
};

const MAX_HISTORICAL = 100;

export class TreasuryAI {
  private readonly ghostbrainUrl:    string;
  private readonly relayUrl:         string;
  private readonly minNetBalanceGst: bigint;
  private readonly maxHistorical:    number;
  private readonly allocPct:         AllocationPct;

  /** Rolling revenue history per chain. */
  private readonly revenueHistory = new Map<ChainId, EpochRevenueSummary[]>();
  /** Last known treasury state per chain. */
  private readonly lastState = new Map<ChainId, TreasuryState>();

  constructor(opts: TreasuryAIOptions = {}) {
    this.ghostbrainUrl    = opts.ghostbrainUrl    ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl         = opts.relayUrl         ?? (process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910");
    this.minNetBalanceGst = opts.minNetBalanceGst ?? 1_000_000n;
    this.maxHistorical    = Math.min(opts.historicalEpochs ?? 24, MAX_HISTORICAL);
    this.allocPct         = this.validateAllocPct(opts.allocationPct ?? DEFAULT_ALLOC);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  updateRevenueSummary(summary: EpochRevenueSummary): void {
    if (!this.revenueHistory.has(summary.chainId)) this.revenueHistory.set(summary.chainId, []);
    const hist = this.revenueHistory.get(summary.chainId)!;
    hist.push(summary);
    if (hist.length > this.maxHistorical) hist.shift();
  }

  async evaluate(state: TreasuryState): Promise<AllocationProposal | null> {
    this.validateState(state);
    this.lastState.set(state.chainId, state);

    const netBalance = state.balanceGst - state.liabilitiesGst;
    if (netBalance < this.minNetBalanceGst) return null;

    const proposal = this.buildProposal(state, netBalance);

    // Forward analysis to GhostBrain.
    this.forwardGhostBrain(proposal).catch((err: Error) =>
      console.error("[TreasuryAI] GhostBrain forward error:", err.message),
    );

    // Submit advisory proposal to relay.
    this.proposeToRelay(proposal).catch((err: Error) =>
      console.error("[TreasuryAI] relay proposal error:", err.message),
    );

    return proposal;
  }

  currentState(chainId: ChainId): TreasuryState | undefined {
    return this.lastState.get(chainId);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateState(s: TreasuryState): void {
    if (s.balanceGst < 0n)         throw new Error("TreasuryAI: balanceGst cannot be negative");
    if (s.liabilitiesGst < 0n)     throw new Error("TreasuryAI: liabilitiesGst cannot be negative");
    if (s.liabilitiesGst > s.balanceGst) throw new Error("TreasuryAI: liabilitiesGst > balanceGst");
  }

  private validateAllocPct(pct: AllocationPct): AllocationPct {
    const total = Object.values(pct).reduce((a, b) => a + b, 0);
    if (total !== 100) throw new Error(`TreasuryAI: allocation percentages must sum to 100 (got ${total})`);
    return pct;
  }

  private buildProposal(state: TreasuryState, netBalance: bigint): AllocationProposal {
    const allocations = {} as Record<AllocCategory, bigint>;
    for (const cat of ALLOC_CATEGORIES) {
      allocations[cat] = (netBalance * BigInt(this.allocPct[cat])) / 100n;
    }

    // Estimate confidence from revenue history depth.
    const hist = this.revenueHistory.get(state.chainId) ?? [];
    const confidence = Math.min(hist.length / this.maxHistorical, 1.0);

    return {
      chainId:       state.chainId,
      timestamp:     state.timestamp,
      balanceGst:    state.balanceGst,
      netBalanceGst: netBalance,
      allocations,
      allocationPct: { ...this.allocPct },
      triggerReason: confidence >= 0.5 ? "routine-epoch-evaluation" : "warmup-evaluation",
      confidence,
    };
  }

  private serialiseProp(p: AllocationProposal): object {
    return {
      chain_id:      p.chainId,
      gas_token:     "GST",
      from:          "ghostbrain-economic-ai",
      timestamp:     p.timestamp,
      balanceGst:    p.balanceGst.toString(),
      netBalanceGst: p.netBalanceGst.toString(),
      allocations:   Object.fromEntries(
        Object.entries(p.allocations).map(([k, v]) => [k, (v as bigint).toString()]),
      ),
      allocationPct:  p.allocationPct,
      triggerReason:  p.triggerReason,
      confidence:     p.confidence,
    };
  }

  private async forwardGhostBrain(p: AllocationProposal): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/treasury-allocation`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialiseProp(p)),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async proposeToRelay(p: AllocationProposal): Promise<void> {
    const resp = await fetch(`${this.relayUrl}/relay/treasury/propose`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(this.serialiseProp(p)),
    });
    if (!resp.ok) throw new Error(`relay responded ${resp.status}`);
  }
}
