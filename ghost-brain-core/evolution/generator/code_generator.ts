/**
 * GhostBrain Self-Evolution Engine — Code Generator
 *
 * Converts an EvolutionTask into a structured EvolutionDiff.
 * An EvolutionDiff is a unified-diff string (NOT an executable string).
 * It describes a concrete, reviewable change to a specific source file.
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. This module NEVER generates arbitrary code strings.
 * 2. All diffs are produced from well-reviewed, hardcoded templates
 *    parameterised by numeric/enum values only.
 * 3. The resulting unifiedDiff is ONLY a description of a change; it is
 *    never eval()ed or executed here.
 * 4. diffHash = SHA-256(unifiedDiff) — tamper-evident.
 */

import { createHash } from "crypto";
import type { EvolutionTask, EvolutionDiff, EvolutionTaskKind } from "../types.js";

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

type DiffTemplate = (task: EvolutionTask, ctx: TemplateContext) => EvolutionDiff | null;

interface TemplateContext {
  now: number;
  /** Repository root — templates embed this for diff header accuracy. */
  repoRoot: string;
}

// ---------------------------------------------------------------------------
// CodeGenerator
// ---------------------------------------------------------------------------

export class CodeGenerator {
  private readonly repoRoot: string;

  constructor(opts?: { repoRoot?: string }) {
    this.repoRoot = opts?.repoRoot ?? process.env["GHOSTBRAIN_REPO_ROOT"] ?? "/home/ghost/ghostl-stack";
  }

  /**
   * Generate an EvolutionDiff for a task.
   * Returns null if no template exists for the given task kind.
   */
  generate(task: EvolutionTask): EvolutionDiff | null {
    const template = TEMPLATES[task.kind];
    if (!template) return null;
    return template(task, { now: Date.now(), repoRoot: this.repoRoot });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiff(
  task:       EvolutionTask,
  targetFile: string,
  rationale:  string,
  diffLines:  string[],
  now:        number,
): EvolutionDiff {
  const unifiedDiff = diffLines.join("\n");
  const diffHash = createHash("sha256").update(unifiedDiff).digest("hex");
  return {
    taskId:      task.id,
    kind:        task.kind,
    targetFile,
    unifiedDiff,
    rationale,
    diffHash,
    generatedAt: now,
  };
}

/** Clamp a numeric value substituted into a template parameter. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Templates
//
// Each template is a pure function.  Parameters are numeric only;
// no user-supplied strings are interpolated.
// ---------------------------------------------------------------------------

const TEMPLATES: Record<EvolutionTaskKind, DiffTemplate> = {

  // -------------------------------------------------------------------------
  improve_container_recovery(task, { now }) {
    // Increase restart delay cap and max-retries floor in infrastructure_ai.
    const currentMaxRetries = 3;
    const newMaxRetries      = clamp(currentMaxRetries + 1, 3, 8);
    const targetFile =
      "ghost-brain-core/swarm/agents/infrastructure_ai.ts";

    return makeDiff(task, targetFile,
      `increase container max-retry threshold from ${currentMaxRetries} to ${newMaxRetries} ` +
      `following ${task.frequency} observed docker_failure events`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,1 @@`,
        ` // INFRA_FAILURE_THRESHOLD controls retry tolerance`,
        `-const INFRA_FAILURE_THRESHOLD = ${currentMaxRetries};`,
        `+const INFRA_FAILURE_THRESHOLD = ${newMaxRetries};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  improve_vm_recovery(task, { now }) {
    const currentPollMs = 5_000;
    const newPollMs      = clamp(
      Math.round(currentPollMs * 0.8 / 500) * 500, // -20%, rounded to 500ms
      2_000,
      currentPollMs,
    );
    const targetFile = "ghost-brain-core/supervisor/supervisor_core.ts";

    return makeDiff(task, targetFile,
      `reduce VM health-check interval from ${currentPollMs}ms to ${newPollMs}ms ` +
      `to improve crash-detection latency (${task.frequency} vm_crash events)`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,1 @@`,
        ` // POLL_INTERVAL_MS controls how often supervisor checks VM health`,
        `-const POLL_INTERVAL_MS = ${currentPollMs};`,
        `+const POLL_INTERVAL_MS = ${newPollMs};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  tune_detection_threshold(task, { now }) {
    // Raise anomaly confidence threshold by 0.05 — bounded to [0.50, 0.95].
    const current = 0.65;
    const updated  = clamp(+( current + 0.05 ).toFixed(2), 0.50, 0.95);
    const targetFile =
      "ghost-brain-core/swarm/agents/security_ai.ts";

    return makeDiff(task, targetFile,
      `raise anomaly confidence threshold from ${current} to ${updated} ` +
      `to reduce false positives (${task.frequency} anomaly_detected events)`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,1 @@`,
        ` // SEC_RISK_THRESHOLD gates what counts as a "high risk" tick`,
        `-const SEC_RISK_THRESHOLD = ${current};`,
        `+const SEC_RISK_THRESHOLD = ${updated};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  add_memory_category(task, { now }) {
    // Add a new EventCategory variant to the system_event type.
    const targetFile = "ghost-brain-core/memory/models/system_event.ts";
    const newCategory = `bridge_timeout`; // contextual — safe, snake_case only

    return makeDiff(task, targetFile,
      `add '${newCategory}' EventCategory variant to capture cross-chain bridge timeout events`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,2 @@`,
        ` // EventCategory union — append new variants here`,
        ` | "repair_failed"`,
        `+| "${newCategory}"`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  improve_network_routing(task, { now }) {
    const currentRetries = 3;
    const newRetries      = clamp(currentRetries + 1, 2, 6);
    const targetFile =
      "ghost-brain-core/swarm/agents/network_ai.ts";

    return makeDiff(task, targetFile,
      `increase network retry count from ${currentRetries} to ${newRetries} ` +
      `following ${task.frequency} degradation events`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,1 @@`,
        ` // NET_MAX_RETRIES governs per-request retry tolerance`,
        `-const NET_MAX_RETRIES = ${currentRetries};`,
        `+const NET_MAX_RETRIES = ${newRetries};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  update_load_balance_weights(task, { now }) {
    // Shift CPU weight slightly lower, memory weight slightly higher.
    const oldCpu = 0.50; const newCpu = 0.45;
    const oldMem = 0.30; const newMem = 0.35;
    const targetFile =
      "ghost-brain-core/memory/learning/resource_optimizer.ts";

    return makeDiff(task, targetFile,
      `rebalance optimizer weights: CPU ${oldCpu}→${newCpu}, MEM ${oldMem}→${newMem} ` +
      `to reflect ${task.frequency} observed hypervisor_mem events`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,2 +1,2 @@`,
        ` // Scoring weight constants`,
        `-const W_CPU = ${oldCpu};`,
        `-const W_MEM = ${oldMem};`,
        `+const W_CPU = ${newCpu};`,
        `+const W_MEM = ${newMem};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  refine_risk_scoring(task, { now }) {
    const oldMem = 0.30; const newMem = 0.35;
    const oldLive = 0.70; const newLive = 0.65;
    const targetFile =
      "ghost-brain-core/swarm/agents/security_ai.ts";

    return makeDiff(task, targetFile,
      `adjust composite risk weight: memory ${oldMem}→${newMem}, live ${oldLive}→${newLive} ` +
      `after ${task.frequency} risk_alert or l2_lag events`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,2 +1,2 @@`,
        ` // Composite risk = live × LIVE_WEIGHT + memory × MEM_WEIGHT`,
        `-const LIVE_WEIGHT = ${oldLive};  const MEM_WEIGHT = ${oldMem};`,
        `+const LIVE_WEIGHT = ${newLive};  const MEM_WEIGHT = ${newMem};`,
      ],
      now,
    );
  },

  // -------------------------------------------------------------------------
  add_swarm_agent(_task, { now }) {
    // Generate a stub registration for a new agent.
    const targetFile = "ghost-brain-core/swarm/start_swarm.ts";

    return makeDiff(_task, targetFile,
      `scaffold registration of a new specialised monitoring agent`,
      [
        `--- a/${targetFile}`,
        `+++ b/${targetFile}`,
        `@@ -1,1 +1,3 @@`,
        ` // Agent registrations`,
        ` swarm.register(infrastructureAI);`,
        `+// TODO (human review): import and register new agent here`,
        `+// swarm.register(newSpecialisedAgent);`,
      ],
      now,
    );
  },
};
