/**
 * ACG — Planner Agent
 *
 * Converts a high-level goal string into a concrete PatchPlan (list of atomic diffs).
 * Rules:
 *   - Diff-only edits: no file rewrites without explicit Change Proposal approval.
 *   - Risk assessment is mandatory before any patch.
 *   - The agent proposes; GhostBrain Core + policy gate decide.
 *
 * In production this calls an LLM API (e.g. Claude / GPT-4) with the orchestrator
 * prompt as system context.  The LLM output is parsed into structured PatchPlan form
 * and validated against JSON Schema before acceptance.
 *
 * NATS subject: acg.patch.request → acg.patch.result
 */

import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type { PatchPlan, FileDiff, RiskLevel, RolloutStrategy } from "../acg/types.js";
import { ACG_SUBJECTS } from "../acg/types.js";
import { publish, subscribe, connectNATS } from "../connectors/nats.js";
import { logger } from "../logger.js";
import { loadPrompt } from "./prompt-loader.js";
import { memorySwapAdvisor } from "../memory/memory-swap-advisor.js";

// ─── Planner Agent ────────────────────────────────────────────────────────────
export class PlannerAgent {
  private readonly _agentId: string;

  constructor() {
    this._agentId = `planner-${uuidv4().substring(0, 8)}`;
  }

  /** Start listening for planning requests on NATS. */
  start(): void {
    subscribe(ACG_SUBJECTS.PATCH_REQUEST, async (msg: unknown) => {
      const req = msg as { proposalId: string; goal: string; scope: string[]; context?: string };
      logger.info("PlannerAgent: received planning request", { proposalId: req.proposalId });
      try {
        const result = await this.plan(req.proposalId, req.goal, req.scope, req.context);
        await publish(ACG_SUBJECTS.PATCH_RESULT, { proposalId: req.proposalId, patchPlan: result });
      } catch (err) {
        const msg2 = err instanceof Error ? err.message : String(err);
        logger.error("PlannerAgent: planning failed", { proposalId: req.proposalId, err: msg2 });
        await publish(ACG_SUBJECTS.PATCH_RESULT, {
          proposalId: req.proposalId,
          error: msg2,
        });
      }
    });
    logger.info("PlannerAgent started", { agentId: this._agentId });
  }

  /**
   * Generate a PatchPlan for the given goal + scope.
   *
   * Steps:
   * 1. Load planner prompt template.
   * 2. Call LLM with goal + repo context.
   * 3. Parse + validate response into PatchPlan.
   * 4. Assess risk level and rollout strategy.
   */
  async plan(
    proposalId: string,
    goal: string,
    scope: string[],
    extraContext?: string,
  ): Promise<PatchPlan> {
    const systemPrompt = await loadPrompt("planner");

    // Inject live memory-swap context so the LLM (and structural heuristics)
    // can factor in current host memory pressure when sizing rollout strategies.
    const memCtx = memorySwapAdvisor.getPlannerContext();

    // In production: call LLM API and parse response.
    // Here we produce a well-typed skeleton that the real LLM output would hydrate.
    const plannerInput = {
      proposalId,
      goal,
      scope,
      extraContext: extraContext ?? "",
      systemPrompt,
      memoryContext: memCtx,
    };

    logger.info("PlannerAgent: generating plan", { proposalId, goal: goal.substring(0, 80) });

    // Placeholder: real impl replaces this with LLM call + response parsing
    const diffs = _deriveStructuralDiffs(goal, scope);
    const commands = _deriveCommands(goal, scope, memCtx);
    const testPlan = _deriveTestPlan(goal);

    const patchPlan: PatchPlan = {
      patchId: uuidv4(),
      proposalId,
      createdAt: new Date().toISOString(),
      title: goal.substring(0, 120),
      diffs,
      commandsToRun: commands,
      testPlan,
      estimatedBlastRadius: Math.min(diffs.length, 5),
    };

    logger.info("PlannerAgent: patch plan created", {
      proposalId,
      patchId: patchPlan.patchId,
      diffs: diffs.length,
    });

    _.noop(plannerInput); // prevent unused-variable lint error; remove after LLM wiring

    return patchPlan;
  }

  /** Assess risk level for a proposed set of diffs. */
  assessRisk(diffs: FileDiff[], scope: string[]): RiskLevel {
    const hasContracts = diffs.some(d => d.path.includes("contracts/"));
    const hasCi = diffs.some(d => d.path.includes(".github/") || d.path.includes("ci/"));
    const hasInfra = diffs.some(d =>
      d.path.includes("docker-compose") ||
      d.path.includes("Dockerfile") ||
      d.path.includes("infra/"),
    );
    const scopeAll = scope.includes("all");

    if (hasContracts || scopeAll) return "critical";
    if (hasCi || hasInfra) return "high";
    if (diffs.length > 5) return "medium";
    return "low";
  }

  /** Select rollout strategy based on risk level. */
  rolloutForRisk(risk: RiskLevel): RolloutStrategy {
    const map: Record<RiskLevel, RolloutStrategy> = {
      low: "none",
      medium: "canary",
      high: "staged",
      critical: "blue-green",
    };
    return map[risk];
  }
}

// ─── Structural heuristics (replace with LLM output in production) ─────────────

function _deriveStructuralDiffs(goal: string, scope: string[]): FileDiff[] {
  // Minimal skeleton — real LLM response provides actual unified diffs
  return scope.slice(0, 3).map<FileDiff>((path, i) => ({
    operation: "modify",
    path,
    patch: `--- a/${path}\n+++ b/${path}\n@@ planner skeleton @@\n- // TODO: planner will generate real diff\n+ // ACG: ${goal.substring(0, 60)}`,
    rationale: `Goal: ${goal} (diff ${i + 1})`,
  }));
}

function _deriveCommands(
  goal: string,
  _scope: string[],
  memCtx?: ReturnType<typeof memorySwapAdvisor.getPlannerContext>,
): string[] {
  const cmds: string[] = ["pnpm install --frozen-lockfile"];
  if (/depend|package|version/i.test(goal)) cmds.push("pnpm audit --audit-level=moderate");
  if (/contract|solidity/i.test(goal)) cmds.push("forge build", "forge test");
  cmds.push("pnpm --filter ghostbrain-core exec tsc --noEmit");
  cmds.push("pnpm test");
  // If host memory pressure is high, advise memory-aware rollout
  if (memCtx && (memCtx.hostPressure ?? 0) > 0.75) {
    cmds.push(`# WARNING: host memory pressure ${((memCtx.hostPressure ?? 0) * 100).toFixed(0)}% — consider staged rollout`);
    cmds.push("pnpm --filter autonomous-vault-hypervisor run memory:swap:status");
  }
  if (memCtx && memCtx.hotspots.length > 0) {
    cmds.push(`# Memory hotspots: ${memCtx.hotspots.map(h => h.name).join(", ")}`);
  }
  return cmds;
}

function _deriveTestPlan(goal: string): string[] {
  return [
    `Unit tests covering: ${goal.substring(0, 60)}`,
    "Regression: existing tests must not break",
    "Integration: re-run affected service integration suite",
  ];
}

// Noop helper to avoid lint error on unused plannerInput (remove after LLM wiring)
const _ = { noop: (_x: unknown) => void 0 };

// ─── Entry-point bootstrap ──────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  connectNATS().then(() => {
    new PlannerAgent().start();
  }).catch((err) => {
    logger.error("PlannerAgent: failed to connect to NATS", { err: String(err) });
    process.exit(1);
  });
}
