/**
 * UpgradePlanner — generates ordered upgrade plans for Ghost services.
 */
export interface UpgradeStep {
  order:       number;
  service:     string;
  action:      "rollout" | "rollback" | "restart" | "config_update";
  description: string;
  risk:        "low" | "medium" | "high";
}

export interface UpgradePlan {
  id:          string;
  createdAt:   number;
  steps:       UpgradeStep[];
  totalRisk:   "low" | "medium" | "high";
  approved:    boolean;
}

export class UpgradePlanner {
  private plans: Map<string, UpgradePlan> = new Map();

  createPlan(services: string[], actionType: UpgradeStep["action"] = "rollout"): UpgradePlan {
    const steps: UpgradeStep[] = services.map((service, i) => ({
      order:       i + 1,
      service,
      action:      actionType,
      description: `${actionType} ${service}`,
      risk:        this.inferRisk(service),
    }));

    const totalRisk = steps.some(s => s.risk === "high")
      ? "high"
      : steps.some(s => s.risk === "medium") ? "medium" : "low";

    const plan: UpgradePlan = {
      id:        `plan-${Date.now()}`,
      createdAt: Date.now(),
      steps,
      totalRisk,
      approved:  totalRisk === "low",   // auto-approve low-risk plans
    };

    this.plans.set(plan.id, plan);
    console.log(`[UpgradePlanner] Plan ${plan.id} created — risk: ${totalRisk}, approved: ${plan.approved}`);
    return plan;
  }

  approve(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan '${planId}' not found`);
    plan.approved = true;
    console.log(`[UpgradePlanner] Plan ${planId} approved`);
  }

  private inferRisk(service: string): UpgradeStep["risk"] {
    if (service.includes("validator") || service.includes("l1")) return "high";
    if (service.includes("bridge")    || service.includes("economy")) return "medium";
    return "low";
  }

  list(): UpgradePlan[] {
    return [...this.plans.values()];
  }
}
