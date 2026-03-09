/**
 * GhostBrain Core — Protection Routes
 */

import type { FastifyInstance }      from "fastify";
import { allStabilities, getUnstableResources } from "../protection/stability_guard.js";
import { predictionHistoryStats }    from "../protection/crash_predictor.js";
import { getThresholdConfig }        from "../protection/threshold_monitor.js";

export async function protectionRoutes(app: FastifyInstance): Promise<void> {
  /** Crash prediction history */
  app.get("/api/v1/protection/predictions", async (_req, reply) => {
    return reply.send(predictionHistoryStats());
  });

  /** All resource stability states */
  app.get("/api/v1/protection/stability", async (_req, reply) => {
    return reply.send({
      all:      allStabilities(),
      unstable: getUnstableResources(),
    });
  });

  /** Current threshold configuration */
  app.get("/api/v1/protection/thresholds", async (_req, reply) => {
    return reply.send(getThresholdConfig());
  });
}
