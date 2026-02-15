import type { Fix } from '../types/hgop.js';

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
  const ok = steps.every((s) => s.ok);
  return { ok, steps };
}
