/**
 * GhostBrain Core — Orchestrator Routes
 */

import type { FastifyInstance }   from "fastify";
import { scoreTargets, lbStats }  from "../orchestrator/load_balancer.js";
import { schedulerStats }         from "../orchestrator/resource_scheduler.js";
import { tierStats }              from "../orchestrator/memory_balancer.js";

export async function orchestratorRoutes(app: FastifyInstance): Promise<void> {
  /** Scheduler + load-balancer aggregate */
  app.get("/api/v1/orchestrator/status", async (_req, reply) => {
    return reply.send({
      scheduler:  schedulerStats(),
      loadBalancer: lbStats(),
      memoryTiers:  tierStats(),
    });
  });

  /** All scored load-balancer targets */
  app.get("/api/v1/orchestrator/targets", async (_req, reply) => {
    return reply.send({ targets: scoreTargets() });
  });
}
