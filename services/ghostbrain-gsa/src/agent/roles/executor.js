/**
 * @file src/agent/roles/executor.js
 * @description Executor role: applies verified plans.
 *
 * SAFE BY DEFAULT: apply is DISABLED unless GSA_APPLY_ENABLED=true.
 * All applied patches must:
 *  a) Have an attached verified OGB bundle hash
 *  b) Have passed the policy engine
 *  c) Have a rollback step
 *
 * Apply is always done via `git apply` on a temporary branch — never direct
 * file mutation without tracking. The executor does NOT call arbitrary shell.
 */

import { enforce } from '../../policy/policy-engine.js';
import { isBundleVerified } from '../../bundles/ogb-verifier.js';
import { put } from '../../storage/cas.js';
import { config } from '../../config.js';
import { runTool } from '../../tools/runner.js';

/**
 * @typedef {Object} ExecuteResult
 * @property {boolean} ok
 * @property {string}  reason
 * @property {string}  [artifactHash]
 * @property {object}  [policyResult]
 */

/**
 * Execute a plan step. Enforces all safety gates before any mutation.
 * @param {object} step         - Plan step from Planner
 * @param {string} bundleHash   - sha256 of verified OGB bundle
 * @param {string} [correlationId]
 * @returns {Promise<ExecuteResult>}
 */
export async function executeStep(step, bundleHash, correlationId) {
  // Gate 1: apply-enabled check
  if (!config.applyEnabled) {
    return { ok: false, reason: 'EXECUTOR_DISABLED: GSA_APPLY_ENABLED is false' };
  }

  // Gate 2: bundle must be verified in CAS
  if (!bundleHash || !isBundleVerified(bundleHash)) {
    return { ok: false, reason: 'EXECUTOR_DENIED: bundleHash not found in verified CAS' };
  }

  // Gate 3: policy engine
  let policyResult;
  try {
    policyResult = enforce({
      mode:        'WRITE',
      action:      'apply',
      filePath:    step.filePath,
      command:     step.rollback?.command,
      hasRollback: !!step.rollback,
      hasTests:    !!step.testHint,
      bundleHash,
    });
  } catch (err) {
    return { ok: false, reason: err.message, policyResult: null };
  }

  if (policyResult.decision === 'DENY') {
    return { ok: false, reason: policyResult.reasons.join('; '), policyResult };
  }

  // Gate 4: if ALLOW_WITH_CONDITIONS, do not proceed with conditions unmet
  if (policyResult.decision === 'ALLOW_WITH_CONDITIONS') {
    return {
      ok: false,
      reason: `CONDITIONS_UNMET: ${policyResult.conditions.join('; ')}`,
      policyResult,
    };
  }

  // Execute dry-run (real application requires explicit patch content)
  // This executor records the intent and stores the artifact; actual git apply
  // is invoked by the runner tool if step.patchFile is provided.
  const record = {
    stepId:       step.stepId,
    bundleHash,
    policySnapshotHash: policyResult.policySnapshotHash,
    correlationId,
    executedAt:   new Date().toISOString(),
    status:       'dry-run',
    patchHint:    step.patchHint,
  };

  const artifactHash = put(record, 'executions');
  return { ok: true, reason: 'dry-run recorded', artifactHash, policyResult };
}

/**
 * Run the test suite and return pass/fail result.
 * @param {string} [cwd]
 */
export async function runTests(cwd = config.repoRoot) {
  const result = await runTool('node-test', 'node', ['--test'], { cwd, timeoutMs: 120_000 });
  return { ok: result.ok, output: result.stdout + result.stderr };
}
