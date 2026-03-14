/**
 * OnboardingEngine — creates deployment guides, bridge configs, and
 * notifies devrel when a project is ready to migrate to GhostChain.
 */

import { updateProjectStatus, Web3Project } from "./projectDiscovery";
import logger from "../utils/logger";

export interface OnboardingPlan {
  projectId:  string;
  project:    string;
  steps:      string[];
  bridgeUrl:  string;
  docsUrl:    string;
  grantEligible: boolean;
  createdAt:  string;
}

const plans: OnboardingPlan[] = [];

export async function onboardProject(project: Web3Project): Promise<OnboardingPlan> {
  const plan: OnboardingPlan = {
    projectId: project.id,
    project:   project.name,
    steps: [
      `1. Clone GhostChain EVM starter: git clone https://github.com/ghostchain/evm-starter`,
      `2. Configure RPC: https://rpc.ghostchain.io (chain-id: 1337)`,
      `3. Bridge existing ${project.currentChain} assets via ghostbridge.io`,
      `4. Deploy contracts: npx hardhat deploy --network ghostchain`,
      `5. Register on GhostXchange for liquidity incentives`,
      `6. Submit grant application at ghostchain.io/grants`,
    ],
    bridgeUrl:     "https://ghostbridge.io",
    docsUrl:       "https://docs.ghostchain.io",
    grantEligible: project.innovScore > 70,
    createdAt:     new Date().toISOString(),
  };

  plans.unshift(plan);
  if (plans.length > 100) plans.pop();
  updateProjectStatus(project.id, "onboarding");
  logger.info(`OnboardingEngine: created plan for ${project.name}`);
  return plan;
}

export function getPlans(): OnboardingPlan[] {
  return plans;
}
