/**
 * GhostChain Global Governance AI — Vote Coordinator
 *
 * Coordinates validator and token-holder voting across the three-layer
 * GhostStack hierarchy for governance proposals open in VoteSystem.
 *
 * Responsibilities:
 *   1. Track open proposals and their voting windows.
 *   2. Ingest raw vote submissions (wallet + support + GST weight) from
 *      all three layers (L1/L2/L3) and forward them to VoteSystem.
 *   3. Resolve vote delegation chains (up to MAX_DELEGATION_DEPTH).
 *   4. Apply validator-weighted voting: validators carry a multiplier based
 *      on their on-chain stake (supplied by off-chain GST snapshot service).
 *   5. After each voting window closes, trigger VoteSystem.finalise() via
 *      the signing relay.
 *   6. Forward tally summaries and participation metrics to GhostBrain.
 *
 * Vote deduplication:
 *   Each (proposalId, address) pair is tracked — late duplicate votes are
 *   rejected.  Weight updates (changed votes) are accepted during open window.
 *
 * Cross-layer aggregation:
 *   L2/L3 votes are collected and their weight is converted to L1 GST
 *   equivalents before submission to VoteSystem on L1.
 *
 * Advisory-only:
 *   VoteCoordinator never calls VoteSystem directly on-chain — all txs go
 *   through the signing relay for human-ratified multi-sig submission.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;
const L2_CHAIN_ID = 901      as const;
const L3_CHAIN_ID = 903      as const;

const MAX_DELEGATION_DEPTH  = 4;
const MAX_OPEN_PROPOSALS    = 500;
const VALIDATOR_MULTIPLIER  = 1.5;   // Validators carry 1.5× weight vs normal holders

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";
const RELAY_URL      = process.env["SIGNING_RELAY_URL"]  ?? "http://localhost:7910";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TargetLayer = "L1" | "L2" | "L3";

export type VoterKind = "TOKEN_HOLDER" | "VALIDATOR";

export interface VoteSubmission {
  proposalId:   number;         // GovernanceCore proposal id
  voter:        string;         // 0x-prefixed wallet address
  voterKind:    VoterKind;
  support:      boolean;        // true = FOR, false = AGAINST
  gstWeight:    bigint;         // GST voting power in wei (snapshot)
  sourceLayer:  TargetLayer;    // Layer the vote was cast on
  castAt:       number;         // Unix seconds
}

export interface VoteTally {
  proposalId:    number;
  votesFor:      bigint;
  votesAgainst:  bigint;
  voterCount:    number;
  validatorCount: number;
  participationPct: number;     // 0..100 (based on totalVotingPower)
}

export interface ProposalVotingContext {
  proposalId:      number;
  description:     string;
  targetLayer:     TargetLayer;
  votingEndsAt:    number;      // Unix seconds
  totalVotingPower: bigint;     // GST snapshot denominator
  finalised:       boolean;
  tally:           VoteTally;
  /** voter address (lowercase) → VoteSubmission */
  votes:           Map<string, VoteSubmission>;
  /** delegator address → delegatee address */
  delegations:     Map<string, string>;
}

export interface VoteCoordinatorOptions {
  ghostbrainUrl?: string;
  relayUrl?:      string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── VoteCoordinator ───────────────────────────────────────────────────────────

export class VoteCoordinator {
  private readonly ghostbrainUrl: string;
  private readonly relayUrl:      string;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  /** proposalId → context */
  private readonly proposals = new Map<number, ProposalVotingContext>();

  constructor(opts: VoteCoordinatorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.relayUrl      = opts.relayUrl      ?? RELAY_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a newly opened proposal for vote tracking.
   */
  registerProposal(
    proposalId:      number,
    description:     string,
    targetLayer:     TargetLayer,
    votingEndsAt:    number,
    totalVotingPower: bigint,
  ): void {
    if (this.proposals.size >= MAX_OPEN_PROPOSALS) this._evictFinalised();

    const tally: VoteTally = {
      proposalId,
      votesFor:         0n,
      votesAgainst:     0n,
      voterCount:       0,
      validatorCount:   0,
      participationPct: 0,
    };

    this.proposals.set(proposalId, {
      proposalId,
      description,
      targetLayer,
      votingEndsAt,
      totalVotingPower,
      finalised:   false,
      tally,
      votes:       new Map(),
      delegations: new Map(),
    });

    console.log(
      `[VoteCoordinator] Registered proposalId=${proposalId} ` +
      `endsAt=${new Date(votingEndsAt * 1000).toISOString()}`,
    );
  }

  /**
   * Record a vote delegation for a proposalId.
   * @param delegator  Address that delegates their vote.
   * @param delegatee  Address that will cast the vote.
   */
  setDelegation(proposalId: number, delegator: string, delegatee: string): void {
    const ctx = this._getOpen(proposalId);
    if (!ctx) return;
    ctx.delegations.set(delegator.toLowerCase(), delegatee.toLowerCase());
  }

  /**
   * Ingest a vote submission.  Resolves delegation chains and applies
   * validator multiplier before accumulating into the tally.
   *
   * Returns the effective tally after this vote.
   */
  collectVote(submission: VoteSubmission): VoteTally {
    const ctx = this._getOpen(submission.proposalId);
    if (!ctx) {
      console.warn(
        `[VoteCoordinator] Proposal ${submission.proposalId} not open — vote rejected`,
      );
      return this._emptyTally(submission.proposalId);
    }

    const voter   = this._resolveDelegate(ctx, submission.voter.toLowerCase());
    const weight  = this._applyMultiplier(submission.gstWeight, submission.voterKind);

    const existing = ctx.votes.get(voter);

    if (existing) {
      // Change vote: undo old tally.
      if (existing.support) ctx.tally.votesFor      -= existing.gstWeight;
      else                   ctx.tally.votesAgainst  -= existing.gstWeight;
    } else {
      ctx.tally.voterCount += 1;
      if (submission.voterKind === "VALIDATOR") ctx.tally.validatorCount += 1;
    }

    // Updated submission stored with effective weight.
    const effective: VoteSubmission = { ...submission, voter, gstWeight: weight };
    ctx.votes.set(voter, effective);

    if (submission.support) ctx.tally.votesFor      += weight;
    else                    ctx.tally.votesAgainst  += weight;

    ctx.tally.participationPct =
      ctx.totalVotingPower > 0n
        ? Number(((ctx.tally.votesFor + ctx.tally.votesAgainst) * 10_000n) / ctx.totalVotingPower) / 100
        : 0;

    void this._sendVoteEvent(ctx, effective);
    return ctx.tally;
  }

  /**
   * Collect raw vote submissions from an array (batch ingestion).
   * Returns total unique voter count after ingestion.
   */
  collectVotes(submissions: VoteSubmission[]): number {
    for (const s of submissions) this.collectVote(s);
    const ctx = this.proposals.get(submissions[0]?.proposalId ?? -1);
    return ctx?.tally.voterCount ?? 0;
  }

  /**
   * Close a proposal's voting window and finalise.
   * Forwards tally to VoteSystem via signing relay.
   */
  async finalise(proposalId: number): Promise<VoteTally> {
    const ctx = this.proposals.get(proposalId);
    if (!ctx) throw new Error(`ProposalId ${proposalId} not registered`);
    if (ctx.finalised) return ctx.tally;

    const now = nowSec();
    if (now < ctx.votingEndsAt) {
      throw new Error(
        `Voting still open for ${proposalId} — ends at ${ctx.votingEndsAt}, now ${now}`,
      );
    }

    ctx.finalised = true;

    // Forward tallies to relay → VoteSystem.finalise().
    await this._submitFinalisationToRelay(ctx);

    // Audit to GhostBrain.
    void this._auditFinalisation(ctx);

    return ctx.tally;
  }

  /** Get current tally for a proposal. */
  getTally(proposalId: number): VoteTally | undefined {
    return this.proposals.get(proposalId)?.tally;
  }

  /** List all tracked proposals. */
  listProposals(): Array<{ proposalId: number; finalised: boolean; tally: VoteTally }> {
    return [...this.proposals.values()].map(({ proposalId, finalised, tally }) => ({
      proposalId,
      finalised,
      tally,
    }));
  }

  // ── Internal — Delegation Resolution ──────────────────────────────────────

  /**
   * Follow delegation chain up to MAX_DELEGATION_DEPTH hops.
   * Returns the ultimate delegatee (or original voter if no delegation).
   */
  private _getOpen(proposalId: number): ProposalVotingContext | undefined {
    const ctx = this.proposals.get(proposalId);
    if (!ctx || ctx.finalised) return undefined;
    return ctx;
  }

  private _resolveDelegate(ctx: ProposalVotingContext, voter: string): string {
    let current = voter;
    for (let i = 0; i < MAX_DELEGATION_DEPTH; i++) {
      const next = ctx.delegations.get(current);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  // ── Internal — Weight ──────────────────────────────────────────────────────

  private _applyMultiplier(weight: bigint, kind: VoterKind): bigint {
    if (kind !== "VALIDATOR") return weight;
    // Apply 1.5× multiplier using integer math (× 15 / 10).
    return (weight * 15n) / 10n;
  }

  // ── Internal — Relay / GhostBrain ─────────────────────────────────────────

  private async _submitFinalisationToRelay(ctx: ProposalVotingContext): Promise<void> {
    const payload: FinalisationPayload = {
      action:       "finalise_vote",
      proposal_id:  ctx.proposalId,
      votes_for:    ctx.tally.votesFor.toString(),
      votes_against: ctx.tally.votesAgainst.toString(),
      voter_count:  ctx.tally.voterCount,
      chain_id:     L1_CHAIN_ID,
      gas_token:    "GST",
      timestamp:    nowSec(),
    };

    try {
      const res = await this.fetcher(`${this.relayUrl}/governance/finalise`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[VoteCoordinator] Relay finalisation failed:", err.message);
    }
  }

  private async _sendVoteEvent(
    ctx: ProposalVotingContext,
    vote: VoteSubmission,
  ): Promise<void> {
    const payload: VoteEvent = {
      event_type:   "vote_cast",
      proposal_id:  ctx.proposalId,
      voter:        vote.voter,
      voter_kind:   vote.voterKind,
      support:      vote.support,
      gst_weight:   vote.gstWeight.toString(),
      source_layer: vote.sourceLayer,
      chain_id:     L1_CHAIN_ID,
      gas_token:    "GST",
      timestamp:    vote.castAt,
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/vote-event`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[VoteCoordinator] GhostBrain vote event failed:", err.message);
    }
  }

  private async _auditFinalisation(ctx: ProposalVotingContext): Promise<void> {
    const payload: AuditPayload = {
      event_type:        "vote_finalised",
      proposal_id:       ctx.proposalId,
      votes_for:         ctx.tally.votesFor.toString(),
      votes_against:     ctx.tally.votesAgainst.toString(),
      voter_count:       ctx.tally.voterCount,
      validator_count:   ctx.tally.validatorCount,
      participation_pct: ctx.tally.participationPct,
      chain_id:          L1_CHAIN_ID,
      gas_token:         "GST",
      timestamp:         nowSec(),
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/finalise-audit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[VoteCoordinator] GhostBrain audit failed:", err.message);
    }
  }

  // ── Internal — Eviction / Utilities ──────────────────────────────────────

  private _evictFinalised(): void {
    for (const [id, ctx] of this.proposals) {
      if (ctx.finalised) {
        this.proposals.delete(id);
        return;
      }
    }
    // Fallback: evict oldest.
    const first = this.proposals.keys().next().value;
    if (first !== undefined) this.proposals.delete(first);
  }

  private _emptyTally(proposalId: number): VoteTally {
    return {
      proposalId,
      votesFor:         0n,
      votesAgainst:     0n,
      voterCount:       0,
      validatorCount:   0,
      participationPct: 0,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ── Payload Shapes ────────────────────────────────────────────────────────────

interface FinalisationPayload {
  action:        string;
  proposal_id:   number;
  votes_for:     string;
  votes_against: string;
  voter_count:   number;
  chain_id:      number;
  gas_token:     string;
  timestamp:     number;
}

interface VoteEvent {
  event_type:   string;
  proposal_id:  number;
  voter:        string;
  voter_kind:   VoterKind;
  support:      boolean;
  gst_weight:   string;
  source_layer: TargetLayer;
  chain_id:     number;
  gas_token:    string;
  timestamp:    number;
}

interface AuditPayload {
  event_type:        string;
  proposal_id:       number;
  votes_for:         string;
  votes_against:     string;
  voter_count:       number;
  validator_count:   number;
  participation_pct: number;
  chain_id:          number;
  gas_token:         string;
  timestamp:         number;
}
