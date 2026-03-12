/**
 * copilot.ts
 *
 * Main AIOC pipeline orchestrator.
 * Chains all five stages: Interpret → Classify → Translate → Validate → Execute.
 */

import { interpret, type ParsedCommand }           from "./commandInterpreter.js";
import { classify, type ClassifiedIntent }          from "./intentClassifier.js";
import { translate, type OrchestratorTask }         from "./taskTranslator.js";
import { validate, type SafetyResult }              from "./safetyValidator.js";
import { execute, type ExecutionResult }            from "./orchestratorBridge.js";

// ── Result type ───────────────────────────────────────────────────────────────

export interface CopilotResult {
  input:      string;
  normalized: string;
  intent:     string;
  confidence: string;
  task:       OrchestratorTask;
  safety:     SafetyResult;
  result:     ExecutionResult;
  timestamp:  number;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function processCopilotCommand(
  raw: string,
  opts: { confirm?: boolean } = {}
): Promise<CopilotResult> {
  if (!raw || raw.trim().length === 0) {
    throw new Error("Command text is required");
  }

  // Stage 1 — Interpret
  const parsed: ParsedCommand = interpret(raw);

  // Stage 2 — Classify
  const cls: ClassifiedIntent = classify(parsed);

  // Stage 3 — Translate
  const task: OrchestratorTask = translate(cls, parsed.entities);

  // Stage 4 — Validate
  const safety: SafetyResult = validate(task, opts.confirm ?? false);

  // Stage 5 — Execute (skipped if safety check failed)
  let result: ExecutionResult;
  if (!safety.ok) {
    result = {
      ok:    false,
      error: safety.reason,
    };
  } else {
    result = await execute(task);
  }

  return {
    input:      raw,
    normalized: parsed.normalized,
    intent:     cls.intent,
    confidence: cls.confidence,
    task,
    safety,
    result,
    timestamp:  Date.now(),
  };
}
