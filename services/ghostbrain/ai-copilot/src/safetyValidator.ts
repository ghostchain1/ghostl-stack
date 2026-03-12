/**
 * safetyValidator.ts
 *
 * Stage 4 of the Copilot pipeline.
 * Prevents dangerous or destructive commands from reaching the
 * Universal Orchestrator without explicit user confirmation.
 */

import type { OrchestratorTask } from "./taskTranslator.js";

// ── Block-lists ───────────────────────────────────────────────────────────────

/** Actions that are ALWAYS blocked — never allowed via natural language. */
const FORBIDDEN_ACTIONS = new Set([
  "delete_chain",
  "wipe_chain",
  "wipe",
  "destroy",
  "drop",
  "nuke",
  "format",
  "purge",
]);

/** Actions that require explicit `confirm: true` in the request body. */
const REQUIRES_CONFIRMATION = new Set([
  "emergency-shutdown",
  "remove",
  "execute",   // governance proposal execution
  "respond",   // threat response (could trigger containment actions)
]);

/** Targets that should never be reached from the natural-language path. */
const PROTECTED_TARGETS = new Set([
  "host",
  "hypervisor",
  "vm-manager",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SafetyResult {
  ok:                     boolean;
  reason?:                string;
  requiresConfirmation?:  boolean;
}

// ── Validator ─────────────────────────────────────────────────────────────────

export function validate(task: OrchestratorTask, confirmed = false): SafetyResult {
  // Query tasks are always safe
  if (task.type === "query") return { ok: true };

  // Missing target / action guard
  if (!task.target || !task.action) {
    return { ok: false, reason: "Missing target or action" };
  }

  // Protected target
  if (PROTECTED_TARGETS.has(task.target)) {
    return { ok: false, reason: `Target "${task.target}" is protected and cannot be reached via the Copilot` };
  }

  // Forbidden action check
  if (FORBIDDEN_ACTIONS.has(task.action)) {
    return { ok: false, reason: `Action "${task.action}" is permanently forbidden via natural-language commands` };
  }

  // Dangerous action — needs confirmation
  if (REQUIRES_CONFIRMATION.has(task.action)) {
    if (!confirmed) {
      return {
        ok: false,
        reason: `Action "${task.action}" on "${task.target}" is high-risk. Send { confirm: true } to proceed.`,
        requiresConfirmation: true,
      };
    }
  }

  // Emergency priority without confirmation
  if (task.priority === "emergency" && !confirmed) {
    return {
      ok: false,
      reason: `Emergency-priority commands require explicit confirmation. Send { confirm: true } to proceed.`,
      requiresConfirmation: true,
    };
  }

  return { ok: true };
}
