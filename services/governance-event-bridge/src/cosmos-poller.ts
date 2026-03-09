/**
 * cosmos-poller.ts — GhostChain Cosmos SDK governance event poller
 *
 * Queries the GhostChain LCD (REST) API for ghostgov proposals and emits
 * BrainMessage signals to ghostbrain-core for each new or updated proposal.
 *
 * The Cosmos SDK chain does not produce EVM-compatible eth_getLogs events.
 * Instead we poll the REST endpoint and diff against our last-seen state.
 *
 * Signals emitted:
 *   governance.proposal.created  — new proposal detected
 *   governance.ai_risk_assigned  — AI risk tier changed / set
 *   governance.proposal.queued   — proposal moved to QUEUED status
 *   governance.proposal.executed — proposal status is EXECUTED
 *   governance.proposal.rejected — proposal status is REJECTED
 */

import type { BrainPoster } from './brain.js';

// ── Cosmos REST types (mirrors ghostchain-sdk CosmosClient) ────────────────────

interface CosmosProposal {
  id: string;
  proposer: string;
  title: string;
  description: string;
  constitutional: boolean;
  amendment: boolean;
  ai_risk_tier: string;
  ai_veto: boolean;
  status: string;
  tally: { for_power: string; against_power: string; abstain_power: string };
  submit_time: string;
  voting_end_time: string;
  eta?: string;
}

// Persisted state: maps proposal ID → last-known status + risk tier.
interface LastKnownState {
  status: string;
  ai_risk_tier: string;
}

// ── Logging helper ─────────────────────────────────────────────────────────────

type LogFn = (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;

// ── CosmosGovPoller ────────────────────────────────────────────────────────────

export class CosmosGovPoller {
  private lcdUrl: string;
  private chainId: string;
  private poster: BrainPoster;
  private log: LogFn;
  /** Maps proposalID → last-known status/risk-tier to detect changes. */
  private seen: Map<string, LastKnownState> = new Map();

  constructor(opts: {
    lcdUrl: string;
    chainId: string;
    poster: BrainPoster;
    log: LogFn;
  }) {
    this.lcdUrl = opts.lcdUrl.replace(/\/$/, '');
    this.chainId = opts.chainId;
    this.poster = opts.poster;
    this.log = opts.log;
  }

  /** Fetch all proposals from the GhostChain LCD. */
  private async fetchProposals(): Promise<CosmosProposal[]> {
    const res = await fetch(`${this.lcdUrl}/ghostchain/ghostgov/v1/proposals`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Cosmos LCD proposals → HTTP ${res.status}`);
    }
    const body = (await res.json()) as { proposals?: CosmosProposal[] };
    return body.proposals ?? [];
  }

  /** Run one polling cycle.  Call this in the main loop on an interval. */
  async poll(): Promise<void> {
    let proposals: CosmosProposal[];
    try {
      proposals = await this.fetchProposals();
    } catch (err) {
      this.log('warn', `[Cosmos] fetch proposals failed: ${String(err)}`);
      return;
    }

    for (const p of proposals) {
      const prev = this.seen.get(p.id);

      if (!prev) {
        // New proposal — emit created signal
        await this.emitSignal('governance.proposal.created', {
          proposalId: p.id,
          proposer: p.proposer,
          title: p.title,
          constitutional: p.constitutional,
          amendment: p.amendment,
          chainId: this.chainId,
          layer: 'CosmosL1',
        });
      } else {
        // Existing proposal — check for status or AI risk tier changes
        if (prev.ai_risk_tier !== p.ai_risk_tier && p.ai_risk_tier) {
          await this.emitSignal('governance.ai_risk_assigned', {
            proposalId: p.id,
            ai_risk_tier: p.ai_risk_tier,
            ai_veto: p.ai_veto,
            chainId: this.chainId,
            layer: 'CosmosL1',
          });
        }
        if (prev.status !== p.status) {
          const subjectMap: Record<string, string> = {
            QUEUED: 'governance.proposal.queued',
            EXECUTED: 'governance.proposal.executed',
            REJECTED: 'governance.proposal.rejected',
          };
          const subject = subjectMap[p.status];
          if (subject) {
            await this.emitSignal(subject, {
              proposalId: p.id,
              status: p.status,
              eta: p.eta,
              chainId: this.chainId,
              layer: 'CosmosL1',
            });
          }
        }
      }

      // Update seen state
      this.seen.set(p.id, { status: p.status, ai_risk_tier: p.ai_risk_tier });
    }
  }

  private async emitSignal(subject: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const correlationId = `cosmos-proposal-${String(payload['proposalId'])}-${this.chainId}`;
      await this.poster.postSignal(subject, correlationId, payload);
      this.log('info', `[Cosmos] signal sent: ${subject} → proposalId=${String(payload['proposalId'])}`);
    } catch (err) {
      this.log('error', `[Cosmos] failed to post signal ${subject}: ${String(err)}`);
    }
  }
}
