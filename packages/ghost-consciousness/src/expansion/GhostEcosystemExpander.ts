import type { EcosystemMetrics, ExpansionPlan, ExpansionAction } from '../types.js';

/**
 * GhostEcosystemExpander — autonomous growth orchestration.
 *
 * Monitors EcosystemMetrics and determines when — and how aggressively — the
 * GhostStack should expand. Expansion actions range from deploying new L3
 * ecosystems and DeFi protocols to opening new geographic regions or scaling
 * validator capacity.
 *
 * Expansion thresholds:
 *  - demand > 80 and utilization > 70 → deploy new L3 ecosystem
 *  - demand > 60 and revenueGrowthRate > 20 → launch DeFi protocol
 *  - userGrowthRate > 30 → launch gaming L3 (high-frequency use case)
 *  - utilization > 85 → scale validators immediately
 *  - availableCapital > 5M and demand > 40 → open new region
 *  - any signal → at minimum plan / hold
 */
export class GhostEcosystemExpander {
  private readonly expansionLog: ExpansionPlan[] = [];

  /**
   * Evaluate current ecosystem metrics and return an expansion plan.
   * Returns null if no expansion is warranted.
   */
  expand(metrics: EcosystemMetrics): ExpansionPlan | null {
    const plan = this.selectPlan(metrics);
    if (plan) this.expansionLog.push(plan);
    return plan;
  }

  /**
   * Force-evaluate and return ALL viable expansion plans ranked by urgency.
   * Useful for planning sessions where multiple investments are possible.
   */
  planAll(metrics: EcosystemMetrics): ExpansionPlan[] {
    return this.buildAllPlans(metrics).sort(
      (a, b) => this.urgencyScore(b) - this.urgencyScore(a),
    );
  }

  /** Returns all previously approved expansion plans. */
  get log(): Readonly<ExpansionPlan[]> {
    return this.expansionLog;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private selectPlan(metrics: EcosystemMetrics): ExpansionPlan | null {
    // Critical: maxed out demand + utilization → new L3
    if (metrics.demand > 80 && metrics.utilization > 70) {
      return this.buildPlan('deploy_l3_ecosystem', metrics, {
        estimatedCost: 200_000,
        estimatedBenefit: 2_000_000,
        timeToMarket: '48-72 hours',
        riskLevel: 'medium',
        rationale: `Demand at ${metrics.demand}% and utilization at ${metrics.utilization}% — new L3 ecosystem required.`,
      });
    }

    // High revenue growth → DeFi protocol launch
    if (metrics.revenueGrowthRate > 20 && metrics.demand > 60) {
      return this.buildPlan('launch_defi_protocol', metrics, {
        estimatedCost: 150_000,
        estimatedBenefit: 1_500_000,
        timeToMarket: '7-14 days',
        riskLevel: 'medium',
        rationale: `Revenue growth at ${metrics.revenueGrowthRate}% — DeFi protocol launch amplifies fee capture.`,
      });
    }

    // Strong user growth → gaming L3
    if (metrics.userGrowthRate > 30) {
      return this.buildPlan('launch_gaming_l3', metrics, {
        estimatedCost: 100_000,
        estimatedBenefit: 800_000,
        timeToMarket: '14-21 days',
        riskLevel: 'low',
        rationale: `User growth at ${metrics.userGrowthRate}% — gaming L3 captures new demographics.`,
      });
    }

    // Near-capacity → scale validators
    if (metrics.utilization > 85) {
      return this.buildPlan('scale_validators', metrics, {
        estimatedCost: 80_000,
        estimatedBenefit: 500_000,
        timeToMarket: '24 hours',
        riskLevel: 'low',
        rationale: `Utilization at ${metrics.utilization}% — immediate validator scaling required.`,
      });
    }

    // Capital available + moderate demand → new region
    if (metrics.availableCapital > 5_000_000 && metrics.demand > 40) {
      return this.buildPlan('open_new_region', metrics, {
        estimatedCost: 300_000,
        estimatedBenefit: 1_200_000,
        timeToMarket: '30 days',
        riskLevel: 'medium',
        rationale: `Capital reserves sufficient and demand at ${metrics.demand}% — geographic expansion warranted.`,
      });
    }

    return null;
  }

  private buildAllPlans(metrics: EcosystemMetrics): ExpansionPlan[] {
    const plans: ExpansionPlan[] = [];
    const actions: ExpansionAction[] = [
      'deploy_l3_ecosystem',
      'launch_defi_protocol',
      'launch_gaming_l3',
      'scale_validators',
      'open_new_region',
      'launch_identity_system',
    ];

    for (const action of actions) {
      if (this.isViable(action, metrics)) {
        plans.push(this.buildDefaultPlan(action, metrics));
      }
    }
    return plans;
  }

  private isViable(action: ExpansionAction, m: EcosystemMetrics): boolean {
    switch (action) {
      case 'deploy_l3_ecosystem': return m.demand > 60;
      case 'launch_defi_protocol': return m.revenueGrowthRate > 10 && m.availableCapital > 100_000;
      case 'launch_gaming_l3': return m.userGrowthRate > 15;
      case 'scale_validators': return m.utilization > 70;
      case 'open_new_region': return m.availableCapital > 2_000_000;
      case 'launch_identity_system': return m.demand > 40;
      default: return false;
    }
  }

  private buildPlan(
    action: ExpansionAction,
    _metrics: EcosystemMetrics,
    overrides: Omit<ExpansionPlan, 'action'>,
  ): ExpansionPlan {
    return { action, ...overrides };
  }

  private buildDefaultPlan(action: ExpansionAction, metrics: EcosystemMetrics): ExpansionPlan {
    const defaults: Record<ExpansionAction, Omit<ExpansionPlan, 'action'>> = {
      deploy_l3_ecosystem: {
        rationale: 'High ecosystem demand.', estimatedCost: 200_000, estimatedBenefit: 2_000_000, timeToMarket: '48h-7d', riskLevel: 'medium',
      },
      launch_defi_protocol: {
        rationale: 'Revenue growth momentum.', estimatedCost: 150_000, estimatedBenefit: 1_500_000, timeToMarket: '7-14d', riskLevel: 'medium',
      },
      launch_gaming_l3: {
        rationale: 'Strong user growth.', estimatedCost: 100_000, estimatedBenefit: 800_000, timeToMarket: '14-21d', riskLevel: 'low',
      },
      scale_validators: {
        rationale: 'Near-capacity utilization.', estimatedCost: 80_000, estimatedBenefit: 500_000, timeToMarket: '24h', riskLevel: 'low',
      },
      open_new_region: {
        rationale: 'Capital + demand aligned.', estimatedCost: 300_000, estimatedBenefit: 1_200_000, timeToMarket: '30d', riskLevel: 'medium',
      },
      launch_identity_system: {
        rationale: 'Identity layer needed for user onboarding.', estimatedCost: 120_000, estimatedBenefit: 900_000, timeToMarket: '21-30d', riskLevel: 'low',
      },
    };
    return { action, ...defaults[action] };
  }

  private urgencyScore(plan: ExpansionPlan): number {
    const riskWeight = { low: 1, medium: 2, high: 3 };
    return (plan.estimatedBenefit / (plan.estimatedCost || 1)) * riskWeight[plan.riskLevel];
  }
}
