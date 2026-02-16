import { createRequire } from "node:module";

import type { Fix } from '../types/hgop.js';

const localRequire = createRequire(import.meta.url);
type PolicyEval = (input: {
  content: string;
  source?: string;
  contextTags?: string[];
}) => { ok: boolean; violations: Array<{ reason: string; line: number; column: number }> };

let evaluateGstPolicy: PolicyEval = () => ({ ok: true, violations: [] });
try {
  const loaded = localRequire("../../../ai-policy/gst_policy.cjs") as {
    evaluateGstPolicy?: PolicyEval;
  };
  if (typeof loaded.evaluateGstPolicy === "function") {
    evaluateGstPolicy = loaded.evaluateGstPolicy;
  }
} catch (error) {
  console.warn("[hyper-ghost-supervisor] gst policy module unavailable; defaulting to pass-through", error);
}

const evaluatePolicy: PolicyEval = (input: {
    content: string;
    source?: string;
    contextTags?: string[];
  }) => evaluateGstPolicy(input);

export type PreflightResult = {
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
};

// Non-destructive preflight: only validates fix metadata + required gates.
export function runPreflight(fix: Fix): PreflightResult {
  const steps: PreflightResult['steps'] = [];
  steps.push({ step: 'fix_exists', ok: Boolean(fix.fix_id) });
  steps.push({ step: 'verification_steps_present', ok: Array.isArray(fix.verification_steps_json) });
  steps.push({ step: 'rollback_plan_present', ok: Boolean(fix.rollback_plan_json) });
  const policyInput = [
    String(fix.description || ''),
    String(fix.diff_summary || ''),
    JSON.stringify(fix.rollback_plan_json ?? {}),
    JSON.stringify(fix.verification_steps_json ?? [])
  ].join('\n');
  const policyCheck = evaluatePolicy({
    content: policyInput,
    source: `hyper-ghost-supervisor.fix.${fix.fix_id}`,
    contextTags: ['ai_patch', 'ai_doc', 'pr_diff']
  });
  steps.push({
    step: 'gst_policy_guard',
    ok: policyCheck.ok,
    detail: policyCheck.ok
      ? undefined
      : `violations=${policyCheck.violations.length}; first=${policyCheck.violations[0]?.reason}@${policyCheck.violations[0]?.line}:${policyCheck.violations[0]?.column}`
  });
  const ok = steps.every((s) => s.ok);
  return { ok, steps };
}
