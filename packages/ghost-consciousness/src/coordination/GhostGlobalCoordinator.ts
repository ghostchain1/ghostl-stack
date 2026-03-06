import type {
  EcosystemState,
  CoordinationDirective,
  NetworkHealth,
  EconomicStatus,
} from '../types.js';

/**
 * GhostGlobalCoordinator — the executive decision engine of the Consciousness Layer.
 *
 * Receives an EcosystemState snapshot (produced by GhostSystemPerception +
 * GhostAwarenessEngine) and maps it to a single top-level CoordinationDirective.
 * The directive is then handed back to the ConsciousnessCore which distributes
 * it to the appropriate sub-systems (swarm council, cognitive layer, expander,
 * diplomat, etc.).
 *
 * Priority order (highest first):
 *   1. Threat / security events
 *   2. Network health degradation
 *   3. Economic instability
 *   4. No diplomatic coverage (long-term)
 *   5. Expansion opportunity
 *   6. Idle / steady state
 */
export class GhostGlobalCoordinator {

  // ── Public API ──────────────────────────────────────────────────────────────

  coordinate(state: EcosystemState): CoordinationDirective {
    // 1. Security threats — top priority
    if (state.threatLevel === 'high') return 'activate_swarm_repair';
    if (state.threatLevel === 'medium' && state.networkHealth === 'critical') return 'activate_swarm_repair';

    // 2. Network health
    if (state.networkHealth === 'critical') return 'activate_swarm_repair';
    if (state.networkHealth === 'degrading') return 'activate_swarm_repair';

    // 3. Economic instability
    if (state.economy === 'contracting') return 'trigger_treasury_strategy';
    if (state.economy === 'volatile') return 'stabilize_economy';

    // 4. Diplomatic gap
    if (state.activeTreaties === 0 && state.networkHealth === 'healthy') return 'engage_diplomacy';

    // 5. Expansion opportunity (healthy network + capacity available)
    if (this.isExpansionOpportunity(state)) return 'initiate_expansion';

    // 6. Governance escalation (medium threat + stable economy)
    if (state.threatLevel === 'medium') return 'escalate_governance';

    return 'idle';
  }

  /** Summarize which subsystems should be notified for a given directive. */
  subsystemsFor(directive: CoordinationDirective): string[] {
    switch (directive) {
      case 'activate_swarm_repair':
        return ['swarm-council', 'devops-ai', 'infrastructure-controller'];
      case 'trigger_treasury_strategy':
        return ['cognitive-layer', 'treasury-strategist', 'tokenomics-controller'];
      case 'stabilize_economy':
        return ['cognitive-layer', 'economic-ai', 'market-analyzer'];
      case 'initiate_expansion':
        return ['ecosystem-expander', 'protocol-incubator', 'swarm-council'];
      case 'engage_diplomacy':
        return ['cross-chain-diplomat', 'treaty-engine'];
      case 'escalate_governance':
        return ['cognitive-layer', 'governance-predictor', 'swarm-council'];
      case 'idle':
        return [];
      default:
        return [];
    }
  }

  /** Explain the directive in human-readable terms. */
  explain(state: EcosystemState): string {
    const directive = this.coordinate(state);
    const subsystems = this.subsystemsFor(directive);
    return (
      `Directive: ${directive}\n` +
      `Notifying subsystems: ${subsystems.join(', ') || 'none'}\n` +
      `Network health: ${state.networkHealth} | Economy: ${state.economy} ` +
      `| Threat: ${state.threatLevel}`
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private isExpansionOpportunity(state: EcosystemState): boolean {
    return (
      state.networkHealth === 'healthy' &&
      (state.economy === 'stable' || state.economy === 'expanding') &&
      state.freeCapacity > 30 &&
      state.nodes >= 10
    );
  }
}
