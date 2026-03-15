/**
 * GrantEngine — evaluates and issues grants to promising ecosystem projects.
 */

import { getAllProjects, Web3Project } from "../projects/projectDiscovery";
import logger from "../utils/logger";

export interface Grant {
  id:          string;
  projectId:   string;
  projectName: string;
  gstAmount:   number;
  usdValue:    number;
  score:       number;
  status:      "pending" | "approved" | "disbursed" | "rejected";
  reason:      string;
  createdAt:   string;
}

const GST_PRICE_USD = 0.85;
const SCORE_THRESHOLD = 1000;

const grants: Grant[] = [];

function computeScore(project: Web3Project): number {
  return project.githubStars + project.users / 10 + project.innovScore * 10;
}

export async function evaluateGrant(project: Web3Project): Promise<Grant> {
  const score     = computeScore(project);
  const approved  = score > SCORE_THRESHOLD;
  const gstAmount = approved ? Math.round(score * 10) : 0;

  const grant: Grant = {
    id:          `grant-${Date.now()}-${project.id}`,
    projectId:   project.id,
    projectName: project.name,
    gstAmount,
    usdValue:    gstAmount * GST_PRICE_USD,
    score,
    status:      approved ? "approved" : "rejected",
    reason:      approved
      ? `Score ${score} exceeds threshold ${SCORE_THRESHOLD}. GitHub stars: ${project.githubStars}, users: ${project.users}.`
      : `Score ${score} below threshold ${SCORE_THRESHOLD}.`,
    createdAt:   new Date().toISOString(),
  };

  grants.unshift(grant);
  if (grants.length > 200) grants.pop();
  logger.info(`GrantEngine: ${grant.status.toUpperCase()} grant for ${project.name} (score=${score})`);
  return grant;
}

export async function runGrantCycle(): Promise<Grant[]> {
  const projects = getAllProjects().filter(p => p.status === "onboarding" || p.status === "contacted");
  return Promise.all(projects.map(evaluateGrant));
}

export function getGrants(): Grant[] {
  return grants;
}
