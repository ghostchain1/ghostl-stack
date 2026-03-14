/**
 * GhostBrain Agent — Control Route
 * POST /api/v1/agent/control  — receive action commands from cluster
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { executeLocalAction, type ActionType } from "../resource_balancer.js";
import { storeLocal } from "../local_memory.js";
import { NODE_ID } from "../node_metrics.js";

const ActionTypeValues: [ActionType, ...ActionType[]] = [
  "restart_container",
  "scale_container_cpu",
  "scale_container_mem",
  "throttle_container",
  "noop",
];

const ControlSchema = z.object({
  type:     z.enum(ActionTypeValues),
  targetId: z.string().min(1).max(128),
  params:   z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  force:    z.boolean().optional(),
});

export async function controlRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/agent/control", async (req, reply) => {
    const parsed = ControlSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.flatten() });
    }

    const result = await executeLocalAction(parsed.data);

    await storeLocal({
      nodeId:   NODE_ID,
      type:     "action_taken",
      severity: result.success ? "info" : "warn",
      data:     { action: result.action, targetId: result.targetId, message: result.message },
    });

    return reply.status(result.success ? 200 : 500).send({ ok: result.success, result });
  });
}
