/**
 * GhostBrain Core — Kernel Routes
 */

import type { FastifyInstance } from "fastify";
import { brainStatus }          from "../kernel/brain.js";
import { eventLoopStats }       from "../kernel/event_loop.js";
import { getEvents, type EventCategory, type EventSeverity } from "../observability/event_logger.js";

export async function kernelRoutes(app: FastifyInstance): Promise<void> {
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
}
