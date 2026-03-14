/**
 * GhostBrain Core — Policy Engine
 *
 * Evaluates action plans against:
 *   1. Routing law (hard invariant — see routingLaw.ts)
 *   2. Governance-locked policy rules
 *   3. Approval gate requirements
 */

import { z } from "zod";
import { ActionMetaSchema, enforceRoutingLaw } from "./routingLaw.js";

export const PlanRequestSchema = z.object({
  requestId: z.string().min(8),
  action:    z.string().min(1),
  params:    z.record(z.any()).default({}),
  meta:      ActionMetaSchema,
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export type Approval = "GOVERNOR" | "AUDITOR";

export type PolicyResult =
  | { ok: true;  approvals: Approval[] }
  | { ok: false; deny: string };

/**
 * Evaluate a plan request against routing law and governance policy.
 *
 * Called by the /actions/plan endpoint before GhostBrain issues a task token
 * or forwards work to any connected agent (e.g. hyper-ghost-ai).
 */
export function evaluatePlan(req: PlanRequest): PolicyResult {
  // 1. Routing law — fail fast, non-overridable
  const routing = enforceRoutingLaw(req.meta);
  if (!routing.ok) return { ok: false, deny: routing.reason };

  // 2. Governance-locked invariants
  if (req.meta.sourceLayer === "L3" && req.meta.intent === "ADMIN") {
    return { ok: false, deny: "Policy: L3 cannot request ADMIN intents — escalate via L2" };
  }
  if (req.meta.sourceLayer === "L2" && req.meta.intent === "BRIDGE") {
    return { ok: false, deny: "Policy: BRIDGE must be initiated at L1, not L2" };
  }

  // 3. Approval gates — additive, de-duped
  const approvals = new Set<Approval>();

  if (req.meta.intent === "ADMIN" || req.meta.intent === "BRIDGE") {
    approvals.add("GOVERNOR");
  }
  if (req.action.includes("deploy") || req.action.includes("upgrade") || req.action.includes("migrate")) {
    approvals.add("AUDITOR");
  }
  // Any ADMIN action touching L1 also requires AUDITOR
  if (req.meta.intent === "ADMIN" && req.meta.sourceLayer === "L1") {
    approvals.add("AUDITOR");
  }

  return { ok: true, approvals: [...approvals] };
}
