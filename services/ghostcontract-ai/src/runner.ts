/**
 * GhostContractAI — In-memory Async Pipeline Runner
 *
 * Manages pipeline lifecycle: create → run → complete/fail.
 * In production, replace the in-memory store with Redis + BullMQ.
 */

import { randomUUID } from "node:crypto";
import type {
  PipelineRecord,
  PipelineStatus,
  PipelineType,
  PipelineResult,
  AuditLogEntry,
} from "./types.js";
import { logger } from "./logger.js";
import {
  pipelineTotal,
  pipelineActive,
  pipelineDurationSeconds,
} from "./metrics.js";
import { MAX_CONCURRENT_PIPELINES } from "./config.js";

// ─── Store ────────────────────────────────────────────────────────────────────

const _pipelines = new Map<string, PipelineRecord>();
let _activeCount = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

export function createPipeline(
  type: PipelineType,
  chain: string,
  dryRun: boolean,
  initiator: string,
): PipelineRecord {
  const id = randomUUID();
  const record: PipelineRecord = {
    id,
    type,
    status: "pending",
    chain,
    dryRun,
    createdAt: new Date().toISOString(),
    auditLog: [
      _logEntry(initiator, "PIPELINE_CREATED", `type=${type} chain=${chain} dryRun=${dryRun}`),
    ],
  };
  _pipelines.set(id, record);
  logger.info("Pipeline created", { pipelineId: id, type, chain, dryRun });
  return record;
}

export function getPipeline(id: string): PipelineRecord | undefined {
  return _pipelines.get(id);
}

export function listPipelines(): PipelineRecord[] {
  return Array.from(_pipelines.values()).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Run a pipeline asynchronously. Enforces concurrency limit.
 * `fn` is the actual pipeline logic returning a PipelineResult.
 */
export async function runPipeline(
  id: string,
  actor: string,
  fn: (record: PipelineRecord) => Promise<PipelineResult>,
): Promise<void> {
  const record = _pipelines.get(id);
  if (!record) throw new Error(`pipeline_not_found: ${id}`);

  if (_activeCount >= MAX_CONCURRENT_PIPELINES) {
    _fail(id, "TOO_MANY_CONCURRENT_PIPELINES");
    return;
  }

  _activeCount++;
  pipelineActive.inc({ type: record.type });
  _setStatus(id, "running");

  const timer = pipelineDurationSeconds.startTimer({ type: record.type, chain: record.chain });
  _audit(id, actor, "PIPELINE_STARTED");

  try {
    const result = await fn(record);
    _setStatus(id, record.dryRun ? "dry_run" : "succeeded");
    record.result = result;
    record.finishedAt = new Date().toISOString();
    _audit(id, actor, "PIPELINE_COMPLETED", result.summary);
    pipelineTotal.inc({ type: record.type, chain: record.chain, result: "success" });
    logger.info("Pipeline completed", { pipelineId: id, summary: result.summary });
  } catch (err) {
    _fail(id, String(err instanceof Error ? err.message : err));
    pipelineTotal.inc({ type: record.type, chain: record.chain, result: "failure" });
    logger.error("Pipeline failed", { pipelineId: id, error: String(err) });
  } finally {
    timer();
    _activeCount--;
    pipelineActive.dec({ type: record.type });
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _setStatus(id: string, status: PipelineStatus): void {
  const p = _pipelines.get(id);
  if (!p) return;
  p.status = status;
  if (status === "running") p.startedAt = new Date().toISOString();
  if (status === "succeeded" || status === "failed" || status === "dry_run") {
    p.finishedAt = new Date().toISOString();
  }
}

function _fail(id: string, reason: string): void {
  const p = _pipelines.get(id);
  if (!p) return;
  p.status = "failed";
  p.error  = reason;
  p.finishedAt = new Date().toISOString();
}

function _audit(id: string, actor: string, action: string, detail?: string): void {
  const p = _pipelines.get(id);
  if (!p) return;
  p.auditLog.push(_logEntry(actor, action, detail));
}

function _logEntry(actor: string, action: string, detail?: string): AuditLogEntry {
  return { ts: new Date().toISOString(), actor, action, ...(detail ? { detail } : {}) };
}
