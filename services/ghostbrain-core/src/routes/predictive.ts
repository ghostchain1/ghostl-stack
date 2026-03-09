/**
 * GhostBrain Core — Predictive AI Routes
 */

import type { FastifyInstance }         from "fastify";
import { forecasterStats, trackedResources, forecastAll } from "../predictive/load_forecaster.js";
import { anomalyStats, getAnomalies, getAnomalyHistory }  from "../predictive/anomaly_detector.js";
import { patternRecognitionStats, getPatterns }            from "../predictive/pattern_recognition.js";
import { predictiveBalancerStats, getRecommendations }     from "../predictive/predictive_balancer.js";
import { failurePredictorStats, getActiveRisks, getRisksForResource } from "../predictive/failure_predictor.js";

export async function predictiveRoutes(app: FastifyInstance): Promise<void> {
  /** Load forecaster stats + on-demand forecast for a resource */
  app.get("/api/v1/predictive/forecasts", async (req, reply) => {
    const q = req.query as { resourceId?: string };
    if (q.resourceId) {
      return reply.send({ forecasts: forecastAll(q.resourceId) });
    }
    return reply.send({
      stats:     forecasterStats(),
      resources: trackedResources(),
    });
  });

  /** Active anomalies */
  app.get("/api/v1/predictive/anomalies", async (req, reply) => {
    const q = req.query as { resourceId?: string; history?: string };
    if (q.history === "true") {
      return reply.send({ anomalies: getAnomalyHistory(200) });
    }
    return reply.send({
      stats:     anomalyStats(),
      anomalies: getAnomalies(q.resourceId),
    });
  });

  /** Discovered recurring patterns */
  app.get("/api/v1/predictive/patterns", async (_req, reply) => {
    return reply.send({
      stats:    patternRecognitionStats(),
      patterns: getPatterns(),
    });
  });

  /** Failure risk predictions */
  app.get("/api/v1/predictive/failures", async (req, reply) => {
    const q = req.query as { resourceId?: string; minRisk?: string };
    if (q.resourceId) {
      return reply.send({ risks: getRisksForResource(q.resourceId) });
    }
    const minRisk = (q.minRisk as "safe" | "low" | "elevated" | "high" | "imminent") ?? "low";
    return reply.send({
      stats: failurePredictorStats(),
      risks: getActiveRisks(minRisk),
    });
  });

  /** Predictive balancer recommendations */
  app.get("/api/v1/predictive/recommendations", async (req, reply) => {
    const q = req.query as { pending?: string };
    const onlyPending = q.pending !== "false";
    return reply.send({
      stats:           predictiveBalancerStats(),
      recommendations: getRecommendations(onlyPending),
    });
  });
}
