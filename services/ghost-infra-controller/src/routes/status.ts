import type { FastifyInstance } from "fastify";
import { getStatus }            from "../state.js";

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  /** Full controller status — cycle history, last actions, error counts. */
  app.get("/api/v1/status", async (_req, reply) => {
    reply.send(getStatus());
  });

  /** Flat list of all InfraActions from the last completed cycle. */
  app.get("/api/v1/actions", async (_req, reply) => {
    const status = getStatus();
    const last   = status.lastCycle;
    reply.send({
      cycleId:   last?.cycleId ?? null,
      timestamp: last?.startTime ?? null,
      actions:   last?.actions ?? [],
    });
  });
}
