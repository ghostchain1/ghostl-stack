/**
 * GhostContractAI — Job Evidence Builder
 *
 * Generates a cryptographically hashable evidence pack for each completed job.
 * Supports optional HMAC signing (Vault signing stub included).
 */

import { createHash, createHmac } from "node:crypto";
import type { Job, JobResult, JobEvidence, TouchedFile } from "../types/jobs.js";
import { forgeVersion } from "../tools/foundry.js";
import { slitherVersion } from "../tools/slither.js";
import { solcVersion } from "../tools/solc.js";
import { logger } from "../logger.js";

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function buildEvidencePack(
  job: Job,
  _ws: unknown,
  result: JobResult,
  touchedFiles: TouchedFile[] = [],
): Promise<JobEvidence> {
  // Collect tool versions in parallel
  const [forge, slither, solc] = await Promise.allSettled([
    forgeVersion(10_000),
    slitherVersion(10_000),
    solcVersion("solc", 10_000),
  ]);

  const toolVersions: Record<string, string> = {
    forge: forge.status === "fulfilled" ? forge.value : "unavailable",
    slither: slither.status === "fulfilled" ? slither.value : "unavailable",
    solc: solc.status === "fulfilled" ? solc.value : "unavailable",
    node: process.version,
  };

  const ev: JobEvidence = {
    jobId: job.id,
    generatedAt: new Date().toISOString(),
    toolVersions,
    touchedFiles,
    ...(result.patchDiff !== undefined && { patchDiff: result.patchDiff }),
    ...(result.artifacts?.["compileLogs"] !== undefined && { compileLogs: result.artifacts["compileLogs"] }),
    ...(result.artifacts?.["testLogs"] !== undefined && { testLogs: result.artifacts["testLogs"] }),
    ...(result.artifacts?.["auditLogs"] !== undefined && { auditLogs: result.artifacts["auditLogs"] }),
    sha256Manifest: "",
  };

  // Compute a deterministic hash of the evidence (before signature)
  const hashPayload = JSON.stringify({ ...ev, signature: undefined });
  ev.sha256Manifest = createHash("sha256")
    .update(hashPayload)
    .digest("hex");

  // Optional HMAC signing
  const hmacSecret = process.env.GHOSTAI_EVIDENCE_HMAC_SECRET;
  if (hmacSecret) {
    ev.signature = createHmac("sha256", hmacSecret)
      .update(ev.sha256Manifest)
      .digest("hex");
  }

  logger.info("Evidence pack built", {
    jobId: job.id,
    sha256: ev.sha256Manifest,
    touchedFiles: touchedFiles.length,
    signed: !!ev.signature,
  });

  return ev;
}
