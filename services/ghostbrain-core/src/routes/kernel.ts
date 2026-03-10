/**
 * GhostBrain Core — Kernel Routes
 *
 * Exposes the kernel brain (Layer 1–5 brain tick), event log, and the
 * AI Kernel Engine (Layer 6) over HTTP.
 */

import type { FastifyInstance } from "fastify";
import { brainStatus }          from "../kernel/brain.js";
import { eventLoopStats }       from "../kernel/event_loop.js";
import { getEvents, type EventCategory, type EventSeverity } from "../observability/event_logger.js";
import {
  kernelEngineStats,
  getRecentKernelResults,
  pauseKernelEngine,
  resumeKernelEngine,
} from "../kernel/kernel_engine.js";
import { dispatch } from "../kernel/command_bus.js";
import type { KernelCommand } from "../kernel/command_bus.js";

export async function kernelRoutes(app: FastifyInstance): Promise<void> {
  // ── Existing routes ─────────────────────────────────────────────────────

  /** Brain health + tick stats */
  app.get("/api/v1/kernel/status", async (_req, reply) => {
    return reply.send({ ...brainStatus(), eventLoop: eventLoopStats() });
  });

  /** Query event log */
  app.get("/api/v1/kernel/events", async (req, reply) => {
    const q = req.query as { limit?: string; category?: string; severity?: string };
    const events = getEvents({
      limit:    q.limit    ? Number(q.limit) : 100,
      category: q.category as EventCategory  | undefined,
      severity: q.severity as EventSeverity  | undefined,
    });
    return reply.send({ events, count: events.length });
  });

  // ── Layer 6 — AI Kernel Engine routes ───────────────────────────────────

  /**
   * GET /kernel/engine/status
   * Full kernel engine stats: counters, handler health, safety guard state.
   */
  app.get("/kernel/engine/status", async (_req, reply) => {
    return reply.send(kernelEngineStats());
  });

  /**
   * GET /kernel/engine/results?n=50
   * Recent kernel command results (ring buffer, max 200).
   */
  app.get("/kernel/engine/results", async (req, reply) => {
    const q = req.query as { n?: string };
    const n = q.n ? Math.min(Number(q.n), 200) : 50;
    return reply.send({ results: getRecentKernelResults(n) });
  });

  /**
   * POST /kernel/engine/dispatch
   * Manually dispatch a kernel command through the command bus (safety-gated).
   * Body: KernelCommand (id omitted — auto-generated)
   *
   * This endpoint is intended for operator / governance use, not autonomous calls.
   * Commands still pass through SafetyGuard — protected targets are blocked.
   */
  app.post("/kernel/engine/dispatch", async (req, reply) => {
    const body = req.body as Partial<KernelCommand>;

    // Minimal validation at the API boundary
    if (!body.type || !body.action) {
      return reply.status(400).send({ error: "type and action are required" });
    }
    const validTypes = ["docker", "vm", "system", "resource"] as const;
    if (!(validTypes as readonly string[]).includes(body.type)) {
      return reply.status(400).send({ error: `invalid type: ${body.type}` });
    }

    const cmd: KernelCommand = {
      type:        body.type as KernelCommand["type"],
      action:      String(body.action),
      target:      body.target   ? String(body.target)  : undefined,
      params:      body.params   ?? undefined,
      requestedBy: "api",
      dryRun:      body.dryRun   ?? true,   // default dry-run for manual calls
    };

    const result = await dispatch(cmd);
    return reply.status(result.ok ? 200 : 422).send(result);
  });

  /**
   * POST /kernel/engine/loop/pause
   * Pause autonomous kernel ticks (commands stop being generated).
   */
  app.post("/kernel/engine/loop/pause", async (_req, reply) => {
    pauseKernelEngine();
    return reply.send({ paused: true });
  });

  /**
   * POST /kernel/engine/loop/resume
   * Resume autonomous kernel ticks.
   */
  app.post("/kernel/engine/loop/resume", async (_req, reply) => {
    resumeKernelEngine();
    return reply.send({ paused: false });
  });
}
