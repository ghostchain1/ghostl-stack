/**
 * @file src/agent/roles/planner.js
 * @description Generates minimal patch plans from diagnosed incidents.
 * Plans are PR-ready: each contains a diff, test requirement, and rollback step.
 * Plans must pass the policy engine before being queued for execution.
 */

import { hashOf } from '../../storage/cas.js';

/**
 * Generate a patch plan for a set of incidents.
 * @param {object[]} incidents - from Diagnostician
 * @param {{ repoRef?: string, policySnapshotHash?: string }} [ctx]
 * @returns {{ planId: string, steps: object[], artifactHash: string, metadata: object }}
 */
export function generatePlan(incidents, ctx = {}) {
  const steps = incidents
    .filter(i => i.severity === 'critical' || i.severity === 'high')
    .map((incident, idx) => ({
      stepId:      `step-${idx + 1}`,
      order:       idx + 1,
      incidentId:  incident.incidentId,
      category:    incident.category,
      title:       incident.title,
      description: `Remediate: ${incident.description}`,
      // Patch hint: planner generates a description of what to change.
      // Actual diff is produced by Executor after user confirms.
      patchHint:   patchHintFor(incident),
      testHint:    testHintFor(incident),
      rollback: {
        description: `Revert change for step-${idx + 1} via git revert`,
        command:     'git revert HEAD --no-commit',
      },
      reversible:    true,
      hasTests:      true,
      timeoutSeconds: 120,
    }));

  const planId = `plan-${Date.now()}`;
  const plan = {
    planId,
    repoRef:             ctx.repoRef ?? 'HEAD',
    policySnapshotHash:  ctx.policySnapshotHash ?? '',
    status:              'draft',
    createdAt:           new Date().toISOString(),
    incidentCount:       incidents.length,
    steps,
  };

  return { ...plan, artifactHash: hashOf(plan) };
}

function patchHintFor(incident) {
  switch (incident.category) {
    case 'security':   return `Update vulnerable dependency: ${incident.title}`;
    case 'branding':   return `Replace forbidden brand string with canonical Ghost/GST reference`;
    case 'governance': return `Enforce routing law: ensure L3→L2→L1 chain; add RoutingLaw invariant`;
    case 'stability':  return `Fix lint error: ${incident.title}`;
    case 'performance': return `Profile and optimize bottleneck: ${incident.title}`;
    default:           return `Investigate and remediate: ${incident.title}`;
  }
}

function testHintFor(incident) {
  switch (incident.category) {
    case 'security':   return `Add npm audit CI gate; verify no high/critical vulns post-fix`;
    case 'branding':   return `Add brand-enforcer scan to CI; assert no ETH leaks`;
    case 'governance': return `Add Foundry test asserting RoutingLaw reverts on L3→L1 direct bypass`;
    default:           return `Add unit test that reproduces the original failure then asserts fix`;
  }
}
