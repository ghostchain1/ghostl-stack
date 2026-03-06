import type {
  DecisionInput,
  SynthesizedDecision,
  CoordinationDirective,
  EcosystemState,
  AwarenessReport,
} from '../types.js';

/**
 * GhostDecisionSynthesizer — multi-signal decision fusion for the Consciousness Layer.
 *
 * Where GhostGlobalCoordinator maps state → directive (fast, rule-based),
 * GhostDecisionSynthesizer merges all available intelligence signals — awareness,
 * swarm votes, treaty coverage, historical events — into a fully reasoned
 * SynthesizedDecision with confidence, rationale, required actions, and an
 * expected outcome statement.
 *
 * The synthesizer is the "inner monologue" of the consciousness: it doesn't
 * just pick an action, it explains why and what needs to happen next.
 */
export class GhostDecisionSynthesizer {

  synthesize(input: DecisionInput): SynthesizedDecision {
    const { state, awareness } = input;

    const directive = this.deriveDirective(state, awareness);
    const confidence = this.computeConfidence(input);
    const rationale = this.buildRationale(state, awareness, directive);
    const subDirectives = this.buildSubDirectives(directive, state);
    const requiredActions = this.buildRequiredActions(directive, state);
    const expectedOutcome = this.buildExpectedOutcome(directive, state);

    return {
      directive,
      confidence,
      rationale,
      subDirectives,
      requiredActions,
      expectedOutcome,
    };
  }

  /** Derive directive incorporating swarm vote signals if available. */
  private deriveDirective(state: EcosystemState, awareness: AwarenessReport): CoordinationDirective {
    // Emergency override
    if (awareness.riskScore >= 75) return 'activate_swarm_repair';
    if (awareness.riskScore >= 50 && state.economy === 'contracting') return 'trigger_treasury_strategy';

    // Expansion signal
    if (awareness.expansionSignal === 'accelerate') return 'initiate_expansion';
    if (awareness.expansionSignal === 'grow' && awareness.riskScore < 30) return 'initiate_expansion';

    // Diplomatic gap
    if (state.activeTreaties === 0 && awareness.riskScore < 40) return 'engage_diplomacy';

    // Economic drift
    if (state.economy === 'volatile') return 'stabilize_economy';

    // Governance
    if (state.threatLevel === 'medium') return 'escalate_governance';

    return 'idle';
  }

  /** Confidence is inversely proportional to conflicting signals. */
  private computeConfidence(input: DecisionInput): number {
    const { state, awareness } = input;
    let confidence = 0.9;

    // Reduce confidence when signals conflict
    if (awareness.networkHealth === 'healthy' && awareness.riskScore > 50) confidence -= 0.2;
    if (state.economy === 'stable' && awareness.expansionSignal === 'consolidate') confidence -= 0.15;
    if (state.activeTreaties > 5 && state.economy === 'contracting') confidence -= 0.1;

    // Boost confidence when signals align
    if (awareness.networkHealth === 'critical' && awareness.riskScore > 70) confidence = Math.min(1, confidence + 0.1);

    return Math.max(0.1, Math.min(1, confidence));
  }

  private buildRationale(
    state: EcosystemState,
    awareness: AwarenessReport,
    directive: CoordinationDirective,
  ): string {
    const parts: string[] = [
      `Network health is ${awareness.networkHealth} (risk score: ${awareness.riskScore}/100).`,
      `Economic posture: ${state.economy}.`,
      `Expansion signal: ${awareness.expansionSignal}.`,
    ];

    if (awareness.infrastructure.bottlenecks.length > 0) {
      parts.push(`Bottlenecks detected: ${awareness.infrastructure.bottlenecks.join(', ')}.`);
    }
    if (state.activeTreaties === 0) parts.push('No active cross-chain treaties — diplomatic exposure high.');

    parts.push(`Selected directive: ${directive}.`);
    return parts.join(' ');
  }

  private buildSubDirectives(directive: CoordinationDirective, state: EcosystemState): string[] {
    switch (directive) {
      case 'activate_swarm_repair':
        return ['dispatch_repair_agents', 'suspend_non_critical_ops', 'alert_operators'];
      case 'trigger_treasury_strategy':
        return ['evaluate_reserve_ratio', 'adjust_token_emissions', 'rebalance_liquidity_pools'];
      case 'stabilize_economy':
        return ['pause_new_commitments', 'reinforce_liquidity', 'alert_market_makers'];
      case 'initiate_expansion':
        return [
          state.freeCapacity > 50 ? 'fast_track_l3_deployment' : 'plan_l3_deployment',
          'incubate_new_protocol',
          'recruit_validators',
        ];
      case 'engage_diplomacy':
        return ['identify_treaty_candidates', 'propose_liquidity_alliance', 'open_bridge_negotiation'];
      case 'escalate_governance':
        return ['raise_governance_alert', 'accelerate_proposal_queue', 'notify_council'];
      default:
        return ['monitor', 'collect_telemetry'];
    }
  }

  private buildRequiredActions(directive: CoordinationDirective, _state: EcosystemState): string[] {
    switch (directive) {
      case 'activate_swarm_repair':
        return [
          'GhostSwarmCouncil.deliberate({ type: "repair" })',
          'GhostSystemPerception.observe() — re-run in 30s',
          'GhostConsciousnessTelemetry.record("repair:started")',
        ];
      case 'trigger_treasury_strategy':
        return [
          'CognitivLayer.GhostTreasuryStrategist.allocate()',
          'CognitiveLayer.GhostTokenomicsController.adjust()',
        ];
      case 'initiate_expansion':
        return [
          'GhostEcosystemExpander.expand(metrics)',
          'GhostProtocolIncubator.incubate(idea)',
        ];
      case 'engage_diplomacy':
        return [
          'GhostCrossChainDiplomat.negotiate(target)',
          'GhostTreatyEngine.sign(treaty)',
        ];
      default:
        return ['no_immediate_action_required'];
    }
  }

  private buildExpectedOutcome(directive: CoordinationDirective, state: EcosystemState): string {
    switch (directive) {
      case 'activate_swarm_repair':
        return 'Network health restores to "recovering" within 2-4 consensus cycles.';
      case 'trigger_treasury_strategy':
        return 'Economic posture stabilises from "contracting" to "stable" within 24h.';
      case 'stabilize_economy':
        return 'Volatility dampens; economy returns to "stable" after liquidity reinforcement.';
      case 'initiate_expansion':
        return `New L3 or protocol deployed within ${state.freeCapacity > 50 ? '48h' : '7 days'}; user base grows.`;
      case 'engage_diplomacy':
        return 'At least one liquidity alliance or bridge agreement signed within 72h.';
      case 'escalate_governance':
        return 'Governance council convened; threat de-escalated through policy action.';
      default:
        return 'System remains in steady state; telemetry continues.';
    }
  }
}
