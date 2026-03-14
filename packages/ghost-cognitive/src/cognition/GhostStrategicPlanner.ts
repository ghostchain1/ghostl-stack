import type { StrategicRoadmap, StrategicInitiative } from '../types.js';

/**
 * GhostStrategicPlanner — produces long-horizon roadmaps for network evolution
 * based on current state and growth targets.
 *
 * The planner reasons over multi-year horizons and generates prioritised
 * initiative lists that feed into on-chain governance proposals.
 */
export class GhostStrategicPlanner {
  private readonly defaultInitiatives: StrategicInitiative[] = [
    { title: 'Expand L3 ecosystem', priority: 'high', estimatedQuarters: 2, description: 'Bootstrap L3 application chains and developer tooling to grow the application layer.' },
    { title: 'Increase validator set', priority: 'high', estimatedQuarters: 1, description: 'Grow the active validator count to improve decentralisation and fault tolerance.' },
    { title: 'Grow bridge liquidity', priority: 'medium', estimatedQuarters: 2, description: 'Increase canonical and third-party bridge TVL to reduce slippage and improve UX.' },
    { title: 'Launch AI governance module', priority: 'medium', estimatedQuarters: 3, description: 'Deploy the cognitive and swarm layers as on-chain governance participants.' },
    { title: 'Cross-chain economic agreements', priority: 'low', estimatedQuarters: 4, description: 'Establish fee-sharing and liquidity compacts with allied L1/L2 ecosystems.' },
  ];

  /**
   * Generate a strategic roadmap for the given horizon.
   *
   * @param horizonYears - Planning horizon in years (1–5).
   */
  plan(horizonYears = 2): StrategicRoadmap {
    const quarters = horizonYears * 4;
    const initiatives = this.defaultInitiatives
      .filter(i => i.estimatedQuarters <= quarters)
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.priority] - rank[b.priority];
      });

    return {
      horizon: `${horizonYears} year${horizonYears !== 1 ? 's' : ''}`,
      initiatives,
    };
  }

  /** Add a custom initiative (e.g. from a passed governance proposal). */
  addInitiative(initiative: StrategicInitiative): void {
    this.defaultInitiatives.push(initiative);
  }

  /** Return only high-priority items for the next quarter. */
  immediateActions(): StrategicInitiative[] {
    return this.defaultInitiatives.filter(i => i.priority === 'high' && i.estimatedQuarters <= 1);
  }
}
