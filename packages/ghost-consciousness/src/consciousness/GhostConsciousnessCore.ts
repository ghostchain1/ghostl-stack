import { GhostGlobalCoordinator } from '../coordination/GhostGlobalCoordinator.js';
import { GhostDecisionSynthesizer } from '../coordination/GhostDecisionSynthesizer.js';
import { GhostAwarenessEngine } from './GhostAwarenessEngine.js';
import { GhostSystemPerception } from '../perception/GhostSystemPerception.js';
import { GhostSwarmCouncil } from '../swarm-intelligence/GhostSwarmCouncil.js';
import { GhostCivilizationMemory } from '../memory/GhostCivilizationMemory.js';
import { GhostConsciousnessTelemetry } from '../telemetry/GhostConsciousnessTelemetry.js';
import type {
  EcosystemState,
  ConsciousnessSnapshot,
  CoordinationDirective,
  SwarmIssue,
  DecisionInput,
} from '../types.js';

/**
 * GhostConsciousnessCore — the central reasoning engine of the Ghost
 * Consciousness Layer (GCL-Ω).
 *
 * Sits at the apex of the GhostStack intelligence hierarchy and coordinates
 * every sub-system: perception → awareness → coordination → swarm council →
 * expansion → diplomacy. Each think() cycle produces a ConsciousnessSnapshot
 * that is stored in long-term CivilizationMemory for historical learning.
 *
 * Intelligence hierarchy:
 *   Consciousness (this)  ← coordinates everything
 *   Cognitive Layer       ← long-term planning
 *   Swarm Layer           ← distributed reaction
 *   Autonomous DevOps     ← self-healing
 *   Infrastructure        ← servers / networking
 *   Blockchain            ← GhostChain / L2 / L3
 */
export class GhostConsciousnessCore {
  readonly coordinator: GhostGlobalCoordinator;
  readonly synthesizer: GhostDecisionSynthesizer;
  readonly awareness: GhostAwarenessEngine;
  readonly perception: GhostSystemPerception;
  readonly swarmCouncil: GhostSwarmCouncil;
  readonly memory: GhostCivilizationMemory;
  readonly telemetry: GhostConsciousnessTelemetry;

  /** Running cycle count — used for heartbeat logging. */
  private cycleCount = 0;

  constructor() {
    this.coordinator = new GhostGlobalCoordinator();
    this.synthesizer = new GhostDecisionSynthesizer();
    this.awareness = new GhostAwarenessEngine();
    this.perception = new GhostSystemPerception();
    this.swarmCouncil = new GhostSwarmCouncil();
    this.memory = new GhostCivilizationMemory();
    this.telemetry = new GhostConsciousnessTelemetry();
  }

  /**
   * Execute one full consciousness cycle:
   *  1. Perceive current ecosystem state
   *  2. Derive awareness report (health, economy, infrastructure)
   *  3. Coordinate — pick a top-level directive
   *  4. Synthesize a detailed decision from all available signals
   *  5. Record in civilization memory
   *  6. Emit telemetry
   */
  async think(): Promise<ConsciousnessSnapshot> {
    this.cycleCount++;
    const state = await this.perception.observe();
    const awarenessReport = this.awareness.analyze(state);
    const directive = this.coordinator.coordinate(state);

    const decisionInput: DecisionInput = {
      state,
      awareness: awarenessReport,
    };
    const decision = this.synthesizer.synthesize(decisionInput);

    const snapshot: ConsciousnessSnapshot = {
      state,
      directive,
      awareness: awarenessReport,
      timestamp: Date.now(),
    };

    // Persist to civilization memory
    this.memory.record({
      type: 'consciousness_cycle',
      description: `Cycle #${this.cycleCount}: directive=${directive}`,
      payload: { directive, decision, awarenessReport },
      significance: directive === 'idle' ? 'low' : 'medium',
    });

    // Emit heartbeat telemetry
    this.telemetry.record('consciousness:cycle', {
      cycle: this.cycleCount,
      directive,
      riskScore: awarenessReport.riskScore,
      networkHealth: awarenessReport.networkHealth,
    });

    return snapshot;
  }

  /**
   * Override the current ecosystem state and force a think() cycle with it.
   * Useful for simulation and testing.
   */
  async reason(state: EcosystemState): Promise<ConsciousnessSnapshot> {
    const awarenessReport = this.awareness.analyze(state);
    const directive = this.coordinator.coordinate(state);
    return {
      state,
      directive,
      awareness: awarenessReport,
      timestamp: Date.now(),
    };
  }

  /**
   * Raise a swarm-wide issue for deliberation.
   * Returns the directive that should be issued based on the vote outcome.
   */
  deliberateSwarmIssue(issue: SwarmIssue): CoordinationDirective {
    const deliberation = this.swarmCouncil.deliberate(issue);

    this.memory.record({
      type: 'swarm_deliberation',
      description: `Swarm deliberated: ${issue.description}`,
      payload: { issue, deliberation },
      significance: deliberation.outcome ? 'high' : 'medium',
    });

    this.telemetry.record('consciousness:swarm_deliberation', {
      issue: issue.id,
      outcome: deliberation.outcome,
      consensus: deliberation.consensus,
    });

    if (!deliberation.outcome) return 'idle';

    switch (issue.type) {
      case 'repair': return 'activate_swarm_repair';
      case 'expansion': return 'initiate_expansion';
      case 'governance': return 'escalate_governance';
      case 'diplomacy': return 'engage_diplomacy';
      case 'security': return 'activate_swarm_repair';
      default: return 'idle';
    }
  }

  /** Return total cycles processed. */
  get cycles(): number {
    return this.cycleCount;
  }
}
