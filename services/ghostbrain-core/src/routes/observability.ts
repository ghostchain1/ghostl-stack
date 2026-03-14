/**
 * GhostBrain Core — Observability Routes
 */

import type { FastifyInstance } from "fastify";
import { toPrometheusText }     from "../observability/metrics_exporter.js";
import { pushStats }            from "../observability/prometheus_gateway.js";
import { activeAlerts, allAlerts } from "../observability/alert_engine.js";
import { logStats }             from "../observability/event_logger.js";

export async function observabilityRoutes(app: FastifyInstance): Promise<void> {
  /** Prometheus text-format scrape endpoint */
  app.get("/metrics", async (_req, reply) => {
    return reply
      .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
      .send(toPrometheusText());
  });

  /** Active + historical alerts */
  app.get("/api/v1/observability/alerts", async (_req, reply) => {
    return reply.send({
      active:  activeAlerts(),
      history: allAlerts(),
    });
  });

  /** Pushgateway push loop stats */
  app.get("/api/v1/observability/push-stats", async (_req, reply) => {
    return reply.send(pushStats());
  });

  /** Event log stats */
  app.get("/api/v1/observability/log-stats", async (_req, reply) => {
    return reply.send(logStats());
  });
}
