import { GhostAgentBase } from './GhostAgentBase.js';
import type { SwarmEvent, Proposal } from '../types.js';
import { randomUUID } from 'node:crypto';

export type ProposalHandler = (proposal: Proposal) => void;

/**
 * GhostGovernanceAgent — monitors chain metrics and proposes governance actions
 * when thresholds are breached.
 *
 * Proposals are emitted via a configurable handler (default: stdout log) so they
 * can be fed into the consensus layer or a governance on-chain contract.
 */
export class GhostGovernanceAgent extends GhostAgentBase {
  private readonly onProposal: ProposalHandler;

  constructor(opts: { onProposal?: ProposalHandler } = {}) {
    super('GhostGovernanceAgent');
    this.onProposal = opts.onProposal ?? ((p) => this.log('info', 'Governance proposal', { proposal: p }));
  }

  process(event: SwarmEvent): void {
    if (event.type !== 'metrics' && event.type !== 'governance-signal') return;

    const metric = event.metric as string | undefined;

    if (metric === 'blocktime-high') {
      this._propose('increase validators', { metric, currentValue: event.value, triggeredBy: event.id });
    } else if (metric === 'validator-count-low') {
      this._propose('expand validator set', { metric, currentValue: event.value });
    } else if (metric === 'fee-spike') {
      this._propose('adjust base fee parameters', { metric, currentValue: event.value });
    }
  }

  private _propose(action: string, payload: Record<string, unknown>): void {
    const proposal: Proposal = {
      id: randomUUID(),
      description: action,
      vote: 'yes',
      score: 1,
      proposedBy: this.name,
      payload,
    };
    this.onProposal(proposal);
  }
}
