/**
 * ACG — Prompt Loader
 *
 * Loads prompt templates from the /prompts directory.
 * Prompts are plain text files with optional {{VARIABLE}} placeholders.
 * Never caches secrets; tokens are injected at runtime via Vault.
 */

import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../../prompts");

export type PromptName = "orchestrator" | "planner" | "auditor" | "debugger";

/**
 * Load a prompt template by name.
 * Returns the raw template string with {{VARIABLE}} placeholders intact.
 */
export async function loadPrompt(name: PromptName): Promise<string> {
  const filePath = join(PROMPTS_DIR, `${name}.txt`);
  try {
    const content = await readFile(filePath, "utf8");
    logger.debug("Prompt loaded", { name, chars: content.length });
    return content;
  } catch (err) {
    logger.warn("Prompt file not found — using fallback", { name, filePath, err: String(err) });
    return _fallbackPrompt(name);
  }
}

/**
 * Interpolate {{VARIABLE}} placeholders in a prompt template.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

// ─── Fallback prompts (minimal in-process version if file not on disk) ─────────

function _fallbackPrompt(name: PromptName): string {
  switch (name) {
    case "orchestrator":
      return `YOU ARE GhostBrain Core (Autonomous Code Guardian).
Mission: keep the codebase stable, secure, and continuously improving.
NON-NEGOTIABLE LAWS:
1) Diff-only edits. Small atomic changes.
2) Never merge without passing: build, tests, security scans, policy checks.
3) Add regression tests for every bug fixed.
4) No secrets in code. Use Vault.
5) Enforce routing law: GhostL3<->GhostL2 only; GhostL2<->GhostChain(L1) only.
OUTPUT: ChangeProposal YAML → PatchPlan → GateResults → PR summary.`;

    case "planner":
      return `You are the GhostBrain Planner Agent.
Convert the user goal into a minimal PatchPlan (list of unified diffs + commands).
Rules: diff-only edits, no rewrites, smallest safe change.
Output format: JSON { patchId, title, diffs: [{operation, path, patch, rationale}], commandsToRun: [], testPlan: [] }`;

    case "auditor":
      return `You are the GhostBrain Security Auditor Agent.
Analyze code changes for: secrets, injection, insecure deps, routing law violations, Solidity issues.
Output format: JSON { findings: [{severity, rule, file, line, message, remediation}] }
Block on CRITICAL and HIGH findings. No exceptions.`;

    case "debugger":
      return `You are the GhostBrain Debugger Agent.
Given a failing test or error: (1) write a FAILING regression test first, (2) apply minimal fix, (3) verify green.
Rule: "new bug = new regression test" is non-negotiable.
Output format: JSON { regressionTest: {path, content}, fix: {path, patch} }`;

    default:
      return `GhostBrain ACG prompt for: ${name}`;
  }
}
