/**
 * GhostContractAI — /v1/jobs REST Routes
 *
 * POST /v1/jobs            — create and enqueue a new job
 * GET  /v1/jobs            — list recent jobs
 * GET  /v1/jobs/:id        — get job detail
 * GET  /v1/jobs/:id/evidence — get evidence pack
 * DELETE /v1/jobs/:id      — cancel a queued job
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jobApiAuth } from "./auth.js";
import { runJob, activeJobCount } from "../core/orchestrator.js";
import {
  insertJob,
  getJob,
  listJobs,
  getEvidence,
  updateJobStatus,
  enqueueJob,
  dequeueJob,
  queueDepth,
} from "../store/sqlite.js";
import { getAllowedRoots } from "../core/policy.js";
import type {
  Job,
  CreateJobRequest,
} from "../types/jobs.js";
import { logger } from "../logger.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const JobTypeEnum = z.enum([
  "CONTRACT_CREATE",
  "CONTRACT_FIX",
  "CONTRACT_UPGRADE",
  "CONTRACT_COMPILE",
  "CONTRACT_AUDIT",
]);

const CreateJobSchema = z.object({
  type: JobTypeEnum,
  targetPaths: z.array(z.string().min(1)).min(1).max(20),
  constraints: z
    .object({
      maxFilesRead: z.number().int().min(1).max(200).optional(),
      maxBytesPerFile: z.number().int().min(1024).max(10_485_760).optional(),
      maxTotalBytes: z.number().int().min(1024).max(104_857_600).optional(),
      maxPatchBytes: z.number().int().min(1024).max(20_971_520).optional(),
      jobTimeoutMs: z.number().int().min(5000).max(3_600_000).optional(),
      childTimeoutMs: z.number().int().min(5000).max(1_800_000).optional(),
      dryRun: z.boolean().optional(),
      concurrency: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .optional(),
  context: z
    .object({
      description: z.string().max(1000).optional(),
      contractNames: z.array(z.string()).max(10).optional(),
      templateId: z.string().max(64).optional(),
      templateParams: z.record(z.string().max(256)).optional(),
      targetPath: z.string().max(512).optional(),
      upgradeStrategy: z.enum(["uups", "transparent", "beacon"]).optional(),
      governorApprovalRef: z.string().max(256).optional(),
      searchQuery: z.string().max(256).optional(),
    })
    .optional(),
});

// ─── Queue drain loop ─────────────────────────────────────────────────────────
// Simple polling drain: pick one job at a time when capacity is available.

const QUEUE_POLL_MS = 2_000;

function startQueueDrain(): void {
  setInterval(() => {
    if (activeJobCount() > 0) return; // busy
    const jobId = dequeueJob();
    if (!jobId) return;
    const job = getJob(jobId);
    if (!job) return;
    logger.info("Queue: dispatching job", { jobId });
    runJob(job).catch((err) =>
      logger.error("Queue: job failed", { jobId, err: String(err) }),
    );
  }, QUEUE_POLL_MS);
}

startQueueDrain();

// ─── Router ───────────────────────────────────────────────────────────────────

export const jobsRouter = Router();

// All /v1/jobs routes require shared-secret auth
jobsRouter.use(jobApiAuth);

// POST /v1/jobs
jobsRouter.post("/", (req: Request, res: Response) => {
  const parsed = CreateJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data as CreateJobRequest;

  // Validate target paths against allowed roots
  const allowedRoots = getAllowedRoots();
  for (const p of body.targetPaths) {
    const allowed = allowedRoots.some(
      (r) => p.startsWith(r + "/") || p === r,
    );
    if (!allowed) {
      res.status(400).json({
        error: `Path "${p}" is outside allowed roots`,
        allowedRoots,
      });
      return;
    }
  }

  if (queueDepth() >= 16) {
    res.status(429).json({ error: "Job queue full — try again later" });
    return;
  }

  const job: Job = {
    id: randomUUID(),
    type: body.type,
    status: "queued",
    targetPaths: body.targetPaths,
    constraints: body.constraints ?? {},
    context: body.context ?? {},
    initiator: (Array.isArray(req.headers["x-initiator"])
      ? req.headers["x-initiator"][0]
      : req.headers["x-initiator"]) ?? "api",
    createdAt: new Date().toISOString(),
  };

  insertJob(job);
  enqueueJob(job.id);

  logger.info("Job enqueued", { jobId: job.id, type: job.type });

  res.status(202).json({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
  });
});

// GET /v1/jobs
jobsRouter.get("/", (_req: Request, res: Response) => {
  const jobs = listJobs(50);
  res.json({ jobs, total: jobs.length, queueDepth: queueDepth() });
});

// GET /v1/jobs/:id
jobsRouter.get("/:id", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(jobId ?? "");
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// GET /v1/jobs/:id/evidence
jobsRouter.get("/:id/evidence", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(jobId ?? "");
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const ev = getEvidence(jobId ?? "");
  if (!ev) {
    res.status(404).json({ error: "Evidence not yet available for this job" });
    return;
  }
  res.json(ev);
});

// DELETE /v1/jobs/:id  (cancel queued job)
jobsRouter.delete("/:id", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(jobId ?? "");
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "queued") {
    res.status(409).json({
      error: `Cannot cancel job in status "${job.status}" — only queued jobs can be cancelled`,
    });
    return;
  }
  updateJobStatus(job.id, "cancelled", { finishedAt: new Date().toISOString() });
  logger.info("Job cancelled", { jobId: job.id });
  res.json({ id: job.id, status: "cancelled" });
});
