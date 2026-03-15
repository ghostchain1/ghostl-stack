import { UpgradePlanner } from "../src/UpgradePlanner";
import { EvolutionGovernor } from "../src/EvolutionGovernor";

const planner  = new UpgradePlanner();
const governor = new EvolutionGovernor();

export const UpgradeAgent = {
  name: "UpgradeAgent",
  description: "Plans and executes service rollouts under governor oversight",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === "upgrade_request") {
      const { services, action } = event.payload as {
        services: string[];
        action:   Parameters<UpgradePlanner["createPlan"]>[1];
      };

      const plan = planner.createPlan(services, action);

      if (governor.approvePlan(plan)) {
        console.log(`[UpgradeAgent] Plan ${plan.id} approved — executing ${plan.steps.length} step(s)`);
        for (const step of plan.steps) {
          console.log(`  [${step.order}] ${step.action} ${step.service}`);
        }
      } else {
        console.warn(`[UpgradeAgent] Plan ${plan.id} requires manual review (risk: ${plan.totalRisk})`);
      }
    }
  },
};
