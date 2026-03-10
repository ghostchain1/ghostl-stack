/**
 * GhostBrain Core — Infrastructure Simulator HTTP Routes
 *
 * POST /api/v1/simulator/evaluate   — dry-run: simulate + policy, no execution
 * POST /api/v1/simulator/execute    — simulate + policy + execute if approved
 * GET  /api/v1/simulator/history    — last N simulation outcomes
 * GET  /api/v1/simulator/policy     — active policy rules
 * GET  /api/v1/simulator/state      — current infrastructure state snapshot
 * GET  /api/v1/simulator/stats      — aggregate simulator metrics
 *
 * All write endpoints are HMAC-authenticated (enforced by hmacAuthPlugin).
 * The evaluate endpoint is read-only (no side effects) and safe to call freely.
 *
 * Governance note: actions with verdict "require_ratification" are never
 * executed autonomously — the caller receives the outcome and must submit a
 * governance proposal through GhostChainGovernor.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { evaluateProposedAction, buildCurrentState, getSimHistory, simulatorStats }
  from "../simulator/index.js";
import { evaluatePolicy, isActionPermitted, recordActionExecuted, policyStats, getPolicyRules }
  from "../kernel/policy_engine.js";
import type { SimAction, SimActionType, SimActionRequester, SimUrgency, SimVerdict }
  from "../simulator/sim_model.js";

const execAsync = promisify(exec);

// ── Validation schema ─────────────────────────────────────────────────────────

const ActionTypeValues: [SimActionType, ...SimActionType[]] = [
  "restart_container",
  "throttle_container_cpu",
  "throttle_container_mem",
  "unthrottle_container",
  "evict_container",
  "adjust_vm_memory",
  "migrate_workload",
  "flush_cache",
  "noop",
];

const RequesterValues: [SimActionRequester, ...SimActionRequester[]] = [
  "supervisor", "scheduler", "operator", "ai",
];

const UrgencyValues: [SimUrgency, ...SimUrgency[]] = [
  "low", "medium", "high", "critical",
];

const SimActionSchema = z.object({
  type:        z.enum(ActionTypeValues),
  targetId:    z.string().min(1).max(128),
  params: z.object({
    cpuLimitPercent: z.number().min(1).max(100).optional(),
    memLimitMb:      z.number().min(64).max(1_048_576).optional(),
    targetNodeId:    z.string().max(128).optional(),
  }).optional(),
  requestedBy: z.enum(RequesterValues).default("operator"),
  urgency:     z.enum(UrgencyValues).default("medium"),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Execute the infrastructure action after all safety gates have passed. */
async function executeApprovedAction(action: SimAction): Promise<{ ok: boolean; message: string }> {
  try {
    switch (action.type) {
      case "restart_container": {
        await execAsync(`docker restart ${action.targetId}`, { timeout: 60_000 });
        recordActionExecuted();
        return { ok: true, message: `Container ${action.targetId} restarted successfully.` };
      }
      case "throttle_container_cpu": {
        const cpuPct = action.params?.cpuLimitPercent ?? 50;
        // Docker NanoCPUs = cpuPercent * 1e7  (100% = 1 CPU = 1e9 nanoCPUs)
        const nanoCpus = Math.round(cpuPct * 1e7);
        await execAsync(`docker update --cpus "${(cpuPct / 100).toFixed(2)}" ${action.targetId}`, { timeout: 10_000 });
        recordActionExecuted();
        return { ok: true, message: `Container ${action.targetId} CPU limited to ${cpuPct}% (${nanoCpus} nano-CPUs).` };
      }
      case "throttle_container_mem": {
        const mb = action.params?.memLimitMb ?? 512;
        await execAsync(`docker update --memory ${mb}m --memory-swap ${mb * 2}m ${action.targetId}`, { timeout: 10_000 });
        recordActionExecuted();
        return { ok: true, message: `Container ${action.targetId} memory limited to ${mb} MB.` };
      }
      case "unthrottle_container": {
        await execAsync(`docker update --cpus "0" --memory 0 --memory-swap 0 ${action.targetId}`, { timeout: 10_000 });
        recordActionExecuted();
        return { ok: true, message: `Container ${action.targetId} resource limits removed.` };
      }
      case "flush_cache": {
        // Flush PageCache — safe, recoverable
        await execAsync("sync && echo 1 > /proc/sys/vm/drop_caches", { timeout: 5_000 });
        recordActionExecuted();
        return { ok: true, message: "Host page cache flushed." };
      }
      case "noop":
        return { ok: true, message: "No-op executed." };
      default:
        return { ok: false, message: `Action type "${action.type}" is not directly executable via this endpoint. Submit via governance.` };
    }
  } catch (err) {
    return { ok: false, message: `Execution failed: ${String(err)}` };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function simulatorRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/simulator/evaluate
   * Dry-run: evaluate an action through policy + sim without executing it.
   */
  app.post("/api/v1/simulator/evaluate", async (req, reply) => {
    const parsed = SimActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.flatten() });
    }

    const action = parsed.data as SimAction;

    // 1. Policy gate
    const policy = evaluatePolicy(action.type, action.targetId, action.requestedBy);

    // 2. Simulation gate (if required by policy)
    let simOutcome = null;
    if (policy.permission === "simulate_first") {
      simOutcome = await evaluateProposedAction(action);
    }

    const finalVerdict: SimVerdict =
      policy.permission === "forbidden"              ? "block" :
      policy.permission === "require_ratification"   ? "require_ratification" :
      policy.permission === "autonomous"             ? "approve" :
      (simOutcome?.verdict ?? "block");

    return reply.send({
      action,
      policy: {
        permission:  policy.permission,
        reason:      policy.reason,
        ruleMatched: policy.matchedRule?.actionType ?? null,
      },
      simulation: simOutcome ?? null,
      verdict:    finalVerdict,
      permitted:  isActionPermitted(policy.permission, simOutcome?.verdict),
      ts:         Date.now(),
    });
  });

  /**
   * POST /api/v1/simulator/execute
   * Policy → Simulate → Execute (if approved).
   * Returns 200 on success, 403 on block, 202 on require_ratification.
   */
  app.post("/api/v1/simulator/execute", async (req, reply) => {
    const parsed = SimActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.flatten() });
    }

    const action = parsed.data as SimAction;

    // 1. Policy gate
    const policy = evaluatePolicy(action.type, action.targetId, action.requestedBy);

    if (policy.permission === "forbidden") {
      return reply.status(403).send({
        verdict:  "block",
        reason:   policy.reason,
        executed: false,
      });
    }

    if (policy.permission === "require_ratification") {
      return reply.status(202).send({
        verdict:  "require_ratification",
        reason:   policy.reason,
        executed: false,
        next:     "Submit a GhostChainGovernor proposal to ratify this action.",
      });
    }

    // 2. Simulation gate (simulate_first or autonomous with simulation for audit)
    const simOutcome = await evaluateProposedAction(action);

    if (!isActionPermitted(policy.permission, simOutcome.verdict)) {
      const statusCode = simOutcome.verdict === "require_ratification" ? 202 : 403;
      return reply.status(statusCode).send({
        verdict:    simOutcome.verdict,
        reason:     simOutcome.verdictReason,
        simulation: simOutcome,
        executed:   false,
      });
    }

    // 3. Execute
    const result = await executeApprovedAction(action);

    return reply.status(result.ok ? 200 : 500).send({
      verdict:    "approve",
      simulation: simOutcome,
      executed:   result.ok,
      result:     result.message,
    });
  });

  /**
   * GET /api/v1/simulator/history
   * Returns last N simulation outcomes.
   */
  app.get("/api/v1/simulator/history", async (req, reply) => {
    const q     = req.query as { limit?: string };
    const limit = Math.min(parseInt(q.limit ?? "50", 10) || 50, 200);
    return reply.send({ history: getSimHistory(limit), total: getSimHistory(200).length });
  });

  /**
   * GET /api/v1/simulator/policy
   * Returns the active policy rule table.
   */
  app.get("/api/v1/simulator/policy", async (_req, reply) => {
    return reply.send({
      rules: getPolicyRules().map(r => ({
        ...r,
        // Convert RegExp to string for JSON serialization
        targetMatch: r.targetMatch ? String(r.targetMatch) : null,
      })),
      stats: policyStats(),
    });
  });

  /**
   * GET /api/v1/simulator/state
   * Returns current live infrastructure state snapshot.
   */
  app.get("/api/v1/simulator/state", async (_req, reply) => {
    const state = await buildCurrentState();
    return reply.send({ state });
  });

  /**
   * GET /api/v1/simulator/stats
   * Returns aggregate simulator and policy metrics.
   */
  app.get("/api/v1/simulator/stats", async (_req, reply) => {
    return reply.send({
      simulator: simulatorStats(),
      policy:    policyStats(),
    });
  });
}
