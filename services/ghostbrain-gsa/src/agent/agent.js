/**
 * @file src/agent/agent.js
 * @description GhostBrain Sovereign Autonomous Agent (GSA) — main orchestrator.
 *
 * Pipeline (always read-only by default):
 *  1. OBSERVE  — collect repo + runtime metadata
 *  2. SCAN     — run audit, lint, semgrep, brand-enforcer
 *  3. DIAGNOSE — classify findings into incidents
 *  4. PLAN     — generate minimal diff plans
 *  5. GOVERN   — verify OGB bundle + policy gate
 *  6. EXECUTE  — apply (DISABLED by default)
 *  7. AUDIT    — post-execution regression checks
 *  8. REPORT   — emit events to GhostBrain Core via bus
 *
 * Each step is logged. Failures are non-fatal (degraded result rather than crash).
 */

import { randomUUID } from 'node:crypto';
import { observe }              from './roles/observer.js';
import { diagnose }             from './roles/diagnostician.js';
import { generatePlan }         from './roles/planner.js';
import { executeStep, runTests } from './roles/executor.js';
import { auditPipeline }        from './roles/auditor.js';
import { governorApprove }      from './roles/governor.js';
import { evaluate }             from '../policy/policy-engine.js';
import { put }                  from '../storage/cas.js';
import { events }               from '../events/bus.js';
import { npmAudit }             from '../tools/audit.js';
import { semgrepScan }          from '../tools/semgrep.js';
import { eslint }               from '../tools/lint.js';
import { config }               from '../config.js';

// Import brand enforcer if available
let scanRepo;
try {
  const mod = await import('../../packages/brand-enforcer/index.js').catch(() => null)
           ?? await import('../../../packages/brand-enforcer/index.js').catch(() => null);
  if (mod) scanRepo = mod.scanRepo;
} catch { /* brand-enforcer optional */ }

/**
 * @typedef {Object} ScanResult
 * @property {boolean} ok
 * @property {string}  correlationId
 * @property {object}  observation
 * @property {object}  findings
 * @property {object}  diagnosis
 */

/**
 * Run the full READ-ONLY scan pipeline.
 * @param {{ repoRoot?: string }} [opts]
 * @returns {Promise<ScanResult>}
 */
export async function runScan(opts = {}) {
  const correlationId = randomUUID();
  const root = opts.repoRoot ?? config.repoRoot;

  // Step 1: Observe
  const observation = await observe(root);

  // Step 2: Scan (all tools in parallel)
  const [auditResult, semgrepResult, lintResult] = await Promise.all([
    npmAudit({ cwd: root }),
    semgrepScan({ cwd: root }),
    eslint({ cwd: root }),
  ]);

  // Brand scan (optional — if brand-enforcer installed)
  let brandViolations = [];
  if (scanRepo) {
    try {
      const brandResult = scanRepo(root, { validateSpec: false });
      brandViolations = brandResult.violations ?? [];
    } catch { /* ignore */ }
  }

  const findings = {
    npmFindings:    auditResult.findings,
    semgrepFindings: semgrepResult.findings,
    lintFindings:   lintResult.findings,
    brandFindings:  brandViolations,
    scanOk: auditResult.ok && semgrepResult.ok,
  };

  // Step 3: Diagnose
  const diagnosis = diagnose(findings);

  // Step 4: Emit finding events
  for (const incident of diagnosis.incidents) {
    await events.findingCreated({ ...incident, repoRoot: root }, correlationId);
  }

  const ok = !diagnosis.summary.hasCritical;
  const artifact = { correlationId, observation, findings, diagnosis };
  const artifactHash = put(artifact, 'scans');

  return { ok, correlationId, observation, findings, diagnosis, artifactHash };
}

/**
 * Generate a plan from scan results, enforcing the policy engine.
 * @param {ScanResult} scanResult
 * @returns {Promise<object>}
 */
export async function runPlan(scanResult) {
  const correlationId = scanResult.correlationId ?? randomUUID();

  // Policy gate (read mode — always allowed)
  const policyResult = evaluate({ mode: 'READ', action: 'plan' });

  const plan = generatePlan(scanResult.diagnosis.incidents, {
    repoRef:            'HEAD',
    policySnapshotHash: policyResult.policySnapshotHash,
  });

  const planHash = put(plan, 'plans');
  await events.planCreated({ ...plan, artifactHash: planHash }, correlationId);
  return { ...plan, artifactHash: planHash, correlationId };
}

/**
 * Run verify pipeline: tests + audit regression.
 * @param {{ repoRoot?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function runVerify(opts = {}) {
  const correlationId = randomUUID();
  const [testResult, auditResult] = await Promise.all([
    runTests(opts.repoRoot),
    auditPipeline(opts),
  ]);

  const ok = testResult.ok && auditResult.ok;
  if (ok) await events.verifyPassed({ correlationId, testResult, auditResult });
  else    await events.verifyFailed({ correlationId, testResult, auditResult });

  return { ok, correlationId, testResult, auditResult };
}

/**
 * Apply a single plan step (DISABLED by default — requires GSA_APPLY_ENABLED).
 * @param {object} step
 * @param {object} bundle - Raw OGB bundle JSON
 * @returns {Promise<object>}
 */
export async function runApply(step, bundle) {
  const correlationId = randomUUID();

  // Governor gate
  const govResult = governorApprove(bundle);
  if (!govResult.ok) {
    await events.policyDenied({ reason: govResult.reason, step }, correlationId);
    return { ok: false, reason: govResult.reason, correlationId };
  }

  // Execute
  const execResult = await executeStep(step, govResult.bundleHash, correlationId);
  if (execResult.ok) {
    await events.patchApplied({ step, ...execResult }, correlationId);
    await events.auditRecord({ action: 'apply', step, bundleHash: govResult.bundleHash }, correlationId);
  } else {
    await events.policyDenied({ reason: execResult.reason, step }, correlationId);
  }

  return { ...execResult, correlationId, bundleHash: govResult.bundleHash };
}
