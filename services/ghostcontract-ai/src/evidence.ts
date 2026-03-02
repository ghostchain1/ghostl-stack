/**
 * GhostContractAI — Evidence Pack Generator
 *
 * Produces a structured evidence pack for each successful pipeline run.
 * The pack contains build manifest, test report, Slither summary,
 * policy gate proof, approval chain, and deployment receipt.
 */

import { createHash } from "node:crypto";
import type {
  EvidencePack,
  BuildManifest,
  TestReport,
  SlitherReport,
  PolicyGateProof,
  ApprovalRecord,
  DeploymentReceipt,
  PipelineRecord,
} from "./types.js";
import { evidencePacksGenerated } from "./metrics.js";
import { logger } from "./logger.js";

export interface EvidencePackInput {
  pipeline: PipelineRecord;
  buildManifest: BuildManifest;
  testReport: TestReport;
  slitherReport: SlitherReport;
  policyGateProof: PolicyGateProof;
  approvalChain: ApprovalRecord[];
  deploymentReceipt?: DeploymentReceipt;
}

export function generateEvidencePack(input: EvidencePackInput): EvidencePack {
  const pack: EvidencePack = {
    pipelineId:       input.pipeline.id,
    generatedAt:      new Date().toISOString(),
    chain:            input.pipeline.chain,
    buildManifest:    input.buildManifest,
    testReport:       input.testReport,
    slitherReport:    input.slitherReport,
    policyGateProof:  input.policyGateProof,
    approvalChain:    input.approvalChain,
    deploymentReceipt: input.deploymentReceipt,
  };

  evidencePacksGenerated.inc({ chain: input.pipeline.chain });
  logger.info("Evidence pack generated", {
    pipelineId: input.pipeline.id,
    chain: input.pipeline.chain,
    slitherOk: input.slitherReport.passed,
    testsOk: input.testReport.invariantsPassed,
  });

  return pack;
}

/**
 * Compute a SHA-256 fingerprint of the evidence pack for on-chain commitment.
 */
export function evidencePackHash(pack: EvidencePack): string {
  return createHash("sha256")
    .update(JSON.stringify(pack))
    .digest("hex");
}

/**
 * A Go/No-Go result derived from the evidence pack.
 * Guards against unsafe deployments.
 */
export interface GoNoGoResult {
  go: boolean;
  blockers: string[];
  warnings: string[];
}

export function evaluateGoNoGo(pack: EvidencePack): GoNoGoResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Hard blockers
  if (pack.testReport.failed > 0) {
    blockers.push(`Tests failed: ${pack.testReport.failed} failures`);
  }
  if (!pack.testReport.invariantsPassed) {
    blockers.push("Invariant tests did not pass");
  }
  if (!pack.slitherReport.passed) {
    blockers.push(`Slither: ${pack.slitherReport.highFindings} high, ${pack.slitherReport.mediumFindings} medium findings`);
  }
  if (!pack.policyGateProof.verified) {
    blockers.push("Policy gate proof not verified");
  }
  if (pack.approvalChain.length === 0) {
    blockers.push("No approvals in approval chain");
  }

  // Warnings (non-blocking)
  if (pack.slitherReport.lowFindings > 0) {
    warnings.push(`Slither: ${pack.slitherReport.lowFindings} low findings — review recommended`);
  }
  if (pack.slitherReport.informational > 0) {
    warnings.push(`Slither: ${pack.slitherReport.informational} informational findings`);
  }

  return {
    go: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Build a minimal stub TestReport from raw Foundry output.
 */
export function parseFoundryOutput(raw: string): TestReport {
  const passedMatch  = raw.match(/(\d+) passed/);
  const failedMatch  = raw.match(/(\d+) failed/);
  const skippedMatch = raw.match(/(\d+) skipped/);

  const passed  = passedMatch  ? Number(passedMatch[1])  : 0;
  const failed  = failedMatch  ? Number(failedMatch[1])  : 0;
  const skipped = skippedMatch ? Number(skippedMatch[1]) : 0;

  const invariantsPassed = !raw.toLowerCase().includes("invariant failed")
    && !raw.toLowerCase().includes("assertion failed");

  return {
    passed,
    failed,
    skipped,
    duration:          0,
    invariantsPassed,
    rawSummary:        raw.slice(0, 4096), // cap size
  };
}

/**
 * Build a minimal stub SlitherReport from raw Slither output.
 */
export function parseSlitherOutput(raw: string): SlitherReport {
  const highMatch = raw.match(/(\d+)\s+high/i);
  const medMatch  = raw.match(/(\d+)\s+medium/i);
  const lowMatch  = raw.match(/(\d+)\s+low/i);
  const infoMatch = raw.match(/(\d+)\s+informational/i);

  const high   = highMatch ? Number(highMatch[1]) : 0;
  const medium = medMatch  ? Number(medMatch[1])  : 0;
  const low    = lowMatch  ? Number(lowMatch[1])  : 0;
  const info   = infoMatch ? Number(infoMatch[1]) : 0;

  return {
    highFindings:   high,
    mediumFindings: medium,
    lowFindings:    low,
    informational:  info,
    rawSummary:     raw.slice(0, 4096),
    passed:         high === 0 && medium === 0,
  };
}
