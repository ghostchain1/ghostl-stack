/**
 * GhostStack Evolution Engine — Planner
 *
 * Converts scanner gaps into a ranked upgrade plan with effort estimates.
 * Submits governance proposals via ghost-ai-swarm-v2 when enabled.
 */

import { fetch } from "undici";
import type { ScanGap, ScanResult } from "./scanner.js";

export interface UpgradeTask {
  id:          string;
  feature:     string;
  category:    string;
  priority:    "high" | "medium" | "low";
  effortDays:  number;
  action:      string;
  dryRun:      boolean;
}

export interface UpgradePlan {
  totalGaps:   number;
  highPriority: number;
  tasks:       UpgradeTask[];
  createdAt:   string;
  dryRun:      boolean;
}

const SWARM_V2_URL = process.env.SWARM_V2_URL ?? "http://127.0.0.1:7970";

const EFFORT_BY_PRIORITY: Record<string, number> = {
  high:   5,
  medium: 10,
  low:    20,
};

export function buildPlan(scan: ScanResult, dryRun = true): UpgradePlan {
  const tasks: UpgradeTask[] = scan.gaps.map((g, i) => ({
    id:         `task-${String(i).padStart(3, "0")}`,
    feature:    g.feature,
    category:   g.category,
    priority:   g.priority,
    effortDays: EFFORT_BY_PRIORITY[g.priority] ?? 15,
    action:     suggestAction(g),
    dryRun,
  }));

  return {
    totalGaps:    tasks.length,
    highPriority: tasks.filter(t => t.priority === "high").length,
    tasks,
    createdAt:    new Date().toISOString(),
    dryRun,
  };
}

export async function executePlan(plan: UpgradePlan): Promise<{ submitted: number; skipped: number }> {
  if (plan.dryRun) return { submitted: 0, skipped: plan.tasks.length };

  let submitted = 0;
  let skipped   = 0;

  for (const task of plan.tasks.filter(t => t.priority === "high")) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);

      const res = await fetch(`${SWARM_V2_URL}/tasks`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({
          targetRole: "governor",
          type:       "draft-proposal",
          payload:    {
            title:       `Upgrade: ${task.feature}`,
            description: `Automated upgrade proposal for missing feature: ${task.feature} (${task.category}). Effort: ~${task.effortDays} days.`,
            auditPassed: false, // human must confirm audit before submission
          },
        }),
        signal: ctrl.signal,
      });

      if (res.ok) submitted++;
      else skipped++;
    } catch {
      skipped++;
    }
  }

  return { submitted, skipped };
}

function suggestAction(gap: ScanGap): string {
  const lower = gap.feature.toLowerCase();

  if (lower.includes("gsoulbound") || lower.includes("soulbound")) return "Deploy GRCSoulbound contract on L1";
  if (lower.includes("ghostyield") || lower.includes("yield"))     return "Deploy GhostYield strategy vault";
  if (lower.includes("ghostlend")  || lower.includes("lend"))      return "Deploy GhostLend protocol on L1";
  if (lower.includes("ghoststable")|| lower.includes("stable"))    return "Deploy GhostStable gUSD CDP";
  if (lower.includes("bridge"))                                     return "Verify bridge contract deployment and escrow";
  if (lower.includes("governor"))                                   return "Deploy GhostChainGovernor with constitution";
  if (lower.includes("treasury"))                                   return "Deploy SovereignTreasuryEngine";
  if (lower.includes("mev"))                                        return "Deploy GhostMEVShield contract";
  if (lower.includes("oracle"))                                     return "Connect Finality Oracle to L1/L2/L3";

  return `Review and implement: ${gap.feature}`;
}
