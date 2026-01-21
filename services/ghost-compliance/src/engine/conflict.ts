import type { DecisionOutput, PolicyEffect } from './types';

export type Triggered = { ruleId: string; priority: number; effect: PolicyEffect };

const uniq = (arr: string[]) => Array.from(new Set(arr));

export function resolveMostRestrictive(triggered: Triggered[]): DecisionOutput {
  const ordered = [...triggered].sort((a, b) => b.priority - a.priority);

  const matchedRules = ordered.map((t) => t.ruleId);
  const reasons: string[] = [];
  const controls: string[] = [];
  const disclosures: string[] = [];

  let hasDeny = false;
  let denyReason = 'DENY';
  let denyMsg = '';

  let hasRequire = false;

  for (const t of ordered) {
    if (t.effect.reason) reasons.push(t.effect.reason);

    if (t.effect.deny) {
      hasDeny = true;
      denyReason = t.effect.deny.reason || denyReason;
      denyMsg = t.effect.deny.message || denyMsg;
    }
    if (t.effect.require) {
      hasRequire = true;
      if (t.effect.require.controls) controls.push(...t.effect.require.controls);
      if (t.effect.require.disclosures) disclosures.push(...t.effect.require.disclosures);
    }
    if (t.effect.allow === false) {
      hasDeny = true;
      denyReason = t.effect.deny?.reason || 'ALLOW_FALSE';
    }
  }

  if (hasDeny) {
    return {
      decision: 'deny',
      reasons: uniq([...reasons, denyReason].filter(Boolean)),
      requiredControls: uniq(controls),
      disclosures: uniq(disclosures),
      matchedRules
    };
  }

  if (hasRequire) {
    return {
      decision: 'allow_with_controls',
      reasons: uniq(reasons),
      requiredControls: uniq(controls),
      disclosures: uniq(disclosures),
      matchedRules
    };
  }

  return {
    decision: 'allow',
    reasons: uniq(reasons),
    requiredControls: [],
    disclosures: [],
    matchedRules
  };
}
