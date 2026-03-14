import type { EcosystemState, AwarenessReport, NetworkHealth, EconomicStatus, ExpansionSignal } from '../types.js';

/**
 * GhostAwarenessEngine — real-time ecosystem state interpreter.
 *
 * Transforms raw telemetry and node observations into a structured
 * AwarenessReport that the ConsciousnessCore and GlobalCoordinator
 * can act upon. The engine scores risk, identifies bottlenecks, and
 * translates infrastructure metrics into semantic health signals.
 */
export class GhostAwarenessEngine {
  private readonly bottleneckThresholds = {
    nodeMin: 5,
    capacityWarnPct: 20,    // free capacity below this → bottleneck
    capacityCritPct: 10,
  };

  /** Derive a rich AwarenessReport from raw ecosystem state. */
  analyze(state: EcosystemState): AwarenessReport {
    const networkHealth = this.deriveNetworkHealth(state);
    const economy = this.deriveEconomyStatus(state);
    const bottlenecks = this.detectBottlenecks(state);
    const expansionSignal = this.deriveExpansionSignal(state);
    const riskScore = this.computeRiskScore(state, bottlenecks);

    return {
      networkHealth,
      economy,
      infrastructure: {
        nodes: state.nodes,
        freeCapacity: state.freeCapacity,
        regions: this.estimateRegions(state.nodes),
        bottlenecks,
      },
      expansionSignal,
      riskScore,
    };
  }

  /** Assess individual network health dim from state fields. */
  private deriveNetworkHealth(state: EcosystemState): NetworkHealth {
    if (state.threatLevel === 'high' || state.nodes < this.bottleneckThresholds.nodeMin) return 'critical';
    if (state.threatLevel === 'medium' || state.freeCapacity < this.bottleneckThresholds.capacityCritPct) return 'degrading';
    if (state.freeCapacity < this.bottleneckThresholds.capacityWarnPct) return 'recovering';
    return 'healthy';
  }

  /** Interpret economic signals. */
  private deriveEconomyStatus(state: EcosystemState): EconomicStatus {
    // Pass-through: in a live system these would be derived from oracle feeds.
    return state.economy;
  }

  /** Identify system bottlenecks from the current state. */
  private detectBottlenecks(state: EcosystemState): string[] {
    const bottlenecks: string[] = [];
    if (state.nodes < this.bottleneckThresholds.nodeMin) bottlenecks.push('insufficient-nodes');
    if (state.freeCapacity < this.bottleneckThresholds.capacityCritPct) bottlenecks.push('near-capacity');
    if (state.economy === 'volatile') bottlenecks.push('economic-volatility');
    if (state.economy === 'contracting') bottlenecks.push('economic-contraction');
    if (state.activeTreaties === 0) bottlenecks.push('no-diplomatic-coverage');
    if (state.swarmCount === 0) bottlenecks.push('no-active-swarms');
    return bottlenecks;
  }

  /** Determine whether the system should expand, hold, or consolidate. */
  private deriveExpansionSignal(state: EcosystemState): ExpansionSignal {
    if (state.economy === 'expanding' && state.freeCapacity > 50) return 'accelerate';
    if (state.economy === 'stable' && state.freeCapacity > 30) return 'grow';
    if (state.economy === 'contracting' || state.threatLevel === 'high') return 'consolidate';
    return 'hold';
  }

  /** Compute a 0-100 risk score (higher = more risk). */
  computeRiskScore(state: EcosystemState, bottlenecks?: string[]): number {
    const b = bottlenecks ?? this.detectBottlenecks(state);
    let score = 0;
    score += b.length * 10;
    score += state.threatLevel === 'high' ? 30 : state.threatLevel === 'medium' ? 15 : state.threatLevel === 'low' ? 5 : 0;
    score += state.economy === 'contracting' ? 20 : state.economy === 'volatile' ? 15 : 0;
    score += Math.max(0, (30 - state.freeCapacity));  // capacity pressure
    return Math.min(100, Math.max(0, score));
  }

  /** Rough region estimate from node count (1 region per 8 nodes). */
  private estimateRegions(nodes: number): string[] {
    const count = Math.max(1, Math.ceil(nodes / 8));
    const names = ['us-east', 'eu-west', 'ap-south', 'us-west', 'sa-east', 'af-south'];
    return names.slice(0, Math.min(count, names.length));
  }
}
