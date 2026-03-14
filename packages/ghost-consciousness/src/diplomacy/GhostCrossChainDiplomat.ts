import { GhostTreatyEngine } from './GhostTreatyEngine.js';
import type { CrossChainTarget, NegotiationProposal, Treaty, TreatyType, TreatyTerms } from '../types.js';

/**
 * GhostCrossChainDiplomat — autonomous cross-chain relationship manager.
 *
 * The Diplomat observes available chains, assesses alignment potential, and
 * proposes treaty terms calibrated to each chain's characteristics.
 *
 * Supported treaty categories:
 *  - liquidity_alliance: lock liquidity across bridge on both sides
 *  - bridge_agreement: define bridge capacity and fee ratios
 *  - validator_alliance: share validator capacity / slash insurance
 *  - shared_infrastructure: cross-deploy infrastructure services
 *  - fee_sharing: revenue share on cross-chain transactions
 *  - security_pact: joint incident response + slashing protection
 *
 * The Diplomat never signs unilaterally; it produces a NegotiationProposal
 * that must be approved by the SwarmCouncil before GhostTreatyEngine.sign()
 * is called.
 */
export class GhostCrossChainDiplomat {
  readonly treatyEngine: GhostTreatyEngine;
  private readonly negotiationHistory: NegotiationProposal[] = [];

  constructor(treatyEngine?: GhostTreatyEngine) {
    this.treatyEngine = treatyEngine ?? new GhostTreatyEngine();
  }

  /**
   * Assess a target chain and propose the most beneficial treaty type.
   * Returns a NegotiationProposal ready for SwarmCouncil approval.
   */
  negotiate(chain: CrossChainTarget): NegotiationProposal {
    const treatyType = this.selectTreatyType(chain);
    const terms = this.buildTerms(chain, treatyType);
    const proposal: NegotiationProposal = { chain, treatyType, terms };
    this.negotiationHistory.push(proposal);
    return proposal;
  }

  /**
   * Negotiate with multiple chains simultaneously.
   * Returns proposals sorted from highest to lowest strategic value.
   */
  negotiateAll(chains: CrossChainTarget[]): NegotiationProposal[] {
    return chains
      .map((c) => this.negotiate(c))
      .sort((a, b) => this.strategicValue(b.chain) - this.strategicValue(a.chain));
  }

  /**
   * Finalise a proposal: sign the treaty via the TreatyEngine.
   * Should only be called after SwarmCouncil deliberation passes.
   */
  conclude(proposal: NegotiationProposal, durationMs?: number): Treaty {
    return this.treatyEngine.sign({
      type: proposal.treatyType,
      parties: ['ghost', proposal.chain.chainId],
      terms: durationMs ? { ...proposal.terms, duration: durationMs } : proposal.terms,
    });
  }

  /** List all past negotiation proposals. */
  get proposals(): Readonly<NegotiationProposal[]> {
    return this.negotiationHistory;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Select the best treaty type based on chain metrics.
   * Priority: high-TVL → liquidity alliance ; high-validators → validator
   * alliance; bridge present → bridge agreement; default → fee sharing.
   */
  private selectTreatyType(chain: CrossChainTarget): TreatyType {
    if ((chain.tvl ?? 0) > 10_000_000) return 'liquidity_alliance';
    if ((chain.validators ?? 0) > 50) return 'validator_alliance';
    if (chain.bridgeAddress) return 'bridge_agreement';
    return 'fee_sharing';
  }

  private buildTerms(chain: CrossChainTarget, type: TreatyType): TreatyTerms {
    const tvl = chain.tvl ?? 1_000_000;
    const base: TreatyTerms = {
      duration: 90 * 24 * 60 * 60 * 1000, // 90 days default
      penalties: ['slash_10pct_on_violation', 'automatic_bridge_suspension'],
    };

    switch (type) {
      case 'liquidity_alliance':
        return { ...base, liquidityCommitment: Math.min(tvl * 0.05, 5_000_000), feeSharePercent: 10 };
      case 'bridge_agreement':
        return { ...base, bridgeCapacity: tvl * 0.1, feeSharePercent: 5 };
      case 'validator_alliance':
        return { ...base, validatorQuota: Math.floor((chain.validators ?? 10) * 0.1) };
      case 'fee_sharing':
        return { ...base, feeSharePercent: 15 };
      case 'security_pact':
        return { ...base, customTerms: { jointIncidentResponse: true, slashInsurance: true } };
      default:
        return base;
    }
  }

  /** Rough strategic-value score for sorting proposals. */
  private strategicValue(chain: CrossChainTarget): number {
    return (chain.tvl ?? 0) / 1_000_000 + (chain.validators ?? 0) * 0.5;
  }
}
