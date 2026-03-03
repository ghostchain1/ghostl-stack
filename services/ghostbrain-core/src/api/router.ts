/**
 * GhostBrain Core — HTTP API
 *
 * Exposes control-plane endpoints for:
 *   - Health + readiness
 *   - Prometheus metrics
 *   - Incident management
 *   - Plan review + approval
 *   - Agent registry
 *   - Health graph (read-only)
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { registry } from "../metrics.js";
import { getOpenIncidents, getIncident } from "../memory/incident-store.js";
import { query } from "../connectors/db.js";
import { vaultHealth } from "../connectors/vault.js";
import { DependencyGraph } from "../planner/dependency-graph.js";
import { logger } from "../logger.js";
import { publish } from "../connectors/nats.js";
import type { HealthSignal, AgentRegistration } from "../types.js";
import { v4 as uuidv4 } from "uuid";
import { acgRouter } from "./acg-router.js";

export function buildRouter(graph: DependencyGraph): express.Router {
  const router = express.Router();

  // ─── Health ────────────────────────────────────────────────────────────────
  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  router.get("/readyz", async (_req, res) => {
    const vault = await vaultHealth().catch(() => ({ sealed: true, initialized: false }));
    const ok = !vault.sealed && vault.initialized;
    res.status(ok ? 200 : 503).json({ ready: ok, vault });
  });

  // ─── Metrics (Prometheus) ──────────────────────────────────────────────────
  router.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  // ─── Incidents ────────────────────────────────────────────────────────────
  router.get("/api/v1/incidents", async (_req, res, next) => {
    try {
      const incidents = await getOpenIncidents(100);
      res.json({ incidents });
    } catch (err) { next(err); }
  });

  router.get("/api/v1/incidents/:id", async (req, res, next) => {
    try {
      const incident = await getIncident(req.params["id"]!);
      if (!incident) return void res.status(404).json({ error: "not found" });
      res.json({ incident });
    } catch (err) { next(err); }
  });

  // ─── Plans ────────────────────────────────────────────────────────────────
  router.get("/api/v1/plans", async (_req, res, next) => {
    try {
      const result = await query<Record<string, unknown>>(
        `SELECT plan_id, incident_id, status, title, blast_radius, policy_decision, created_at
         FROM change_plans ORDER BY created_at DESC LIMIT 50`
      );
      res.json({ plans: result.rows });
    } catch (err) { next(err); }
  });

  router.get("/api/v1/plans/:id", async (req, res, next) => {
    try {
      const result = await query<Record<string, unknown>>(
        `SELECT * FROM change_plans WHERE plan_id=$1`,
        [req.params["id"]]
      );
      if (!result.rows[0]) return void res.status(404).json({ error: "not found" });
      res.json({ plan: result.rows[0] });
    } catch (err) { next(err); }
  });

  // Manual plan approval endpoint (break-glass / human override)
  const ApproveBody = z.object({ approved: z.boolean(), reason: z.string().min(1) });

  router.post("/api/v1/plans/:id/approve", async (req, res, next) => {
    try {
      const body = ApproveBody.parse(req.body);
      await query(
        `UPDATE change_plans SET status=$1 WHERE plan_id=$2`,
        [body.approved ? "approved" : "failed", req.params["id"]]
      );
      logger.info("Plan manually reviewed", { planId: req.params["id"], approved: body.approved, reason: body.reason });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ─── Health Graph (read-only) ──────────────────────────────────────────────
  router.get("/api/v1/health-graph", (_req, res) => {
    const g = graph.toHealthGraph();
    res.json({
      updatedAt: g.updatedAt,
      anomalies: g.anomalies,
      nodes: Array.from(g.nodes.values()),
    });
  });

  // ─── Agents ───────────────────────────────────────────────────────────────
  router.get("/api/v1/agents", async (_req, res, next) => {
    try {
      const result = await query<Record<string, unknown>>(
        `SELECT * FROM agent_registry ORDER BY registered_at DESC`
      );
      res.json({ agents: result.rows });
    } catch (err) { next(err); }
  });

  // ─── Audit log ────────────────────────────────────────────────────────────
  router.get("/api/v1/audit", async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
      const result = await query<Record<string, unknown>>(
        `SELECT * FROM audit_log ORDER BY logged_at DESC LIMIT $1`,
        [limit]
      );
      res.json({ entries: result.rows });
    } catch (err) { next(err); }
  });

  // ─── Signal ingestion (HTTP gateway for non-NATS agents) ──────────────────
  // POST /api/v1/signals  — accepts a HealthSignal body, forwards to NATS
  const SignalBody = z.object({
    signalId: z.string().optional(),
    source: z.enum(["prometheus", "loki", "docker", "libvirt", "nats", "manual"]),
    service: z.string().optional(),
    layer: z.enum(["L1", "L2", "L3"]).optional(),
    metric: z.string().optional(),
    value: z.number().optional(),
    threshold: z.number().optional(),
    logLine: z.string().optional(),
    observedAt: z.string().optional(),
    anomaly: z.boolean().default(false),
  });

  router.post("/api/v1/signals", (req, res, next) => {
    try {
      const body = SignalBody.parse(req.body);
      const signal: HealthSignal = {
        signalId: body.signalId ?? uuidv4(),
        source: body.source,
        observedAt: body.observedAt ?? new Date().toISOString(),
        anomaly: body.anomaly,
        ...(body.service    !== undefined && { service:   body.service }),
        ...(body.layer      !== undefined && { layer:     body.layer }),
        ...(body.metric     !== undefined && { metric:    body.metric }),
        ...(body.value      !== undefined && { value:     body.value }),
        ...(body.threshold  !== undefined && { threshold: body.threshold }),
        ...(body.logLine    !== undefined && { logLine:   body.logLine }),
      };
      const subject = signal.anomaly ? "ghostbrain.signal.anomaly" : "ghostbrain.signal.health";
      publish(subject, signal);
      logger.info("HTTP signal ingested", { signalId: signal.signalId, source: signal.source, anomaly: signal.anomaly });
      res.json({ ok: true, signalId: signal.signalId });
    } catch (err) { next(err); }
  });

  // ─── Agent registration (HTTP gateway for non-NATS agents) ────────────────
  // POST /api/v1/agents/register  — accepts AgentRegistration, forwards to NATS
  const AgentRegBody = z.object({
    agentId: z.string(),
    role: z.enum(["sentinel", "diagnostician", "planner", "executor", "auditor", "governor"]),
    capabilities: z.array(z.string()),
    resourceScopes: z.array(z.object({
      type: z.enum(["vm", "stack", "domain", "db", "network"]),
      name: z.string(),
      layer: z.enum(["L1", "L2", "L3"]),
    })),
    natsSubject: z.string().optional(),
    healthy: z.boolean().default(true),
  });

  router.post("/api/v1/agents/register", (req, res, next) => {
    try {
      const body = AgentRegBody.parse(req.body);
      const now = new Date().toISOString();
      const reg: AgentRegistration = {
        agentId: body.agentId,
        role: body.role as AgentRegistration["role"],
        capabilities: body.capabilities as AgentRegistration["capabilities"],
        resourceScopes: body.resourceScopes as AgentRegistration["resourceScopes"],
        natsSubject: body.natsSubject ?? `ghostbrain.agent.${body.agentId}.task`,
        registeredAt: now,
        lastSeen: now,
        healthy: body.healthy,
      };
      publish("ghostbrain.agent.register", reg);
      logger.info("HTTP agent registration ingested", { agentId: reg.agentId, role: reg.role });
      res.json({ ok: true, agentId: reg.agentId });
    } catch (err) { next(err); }
  });

  // ─── Autonomous Code Guardian (ACG) ───────────────────────────────────────
  router.use("/acg", acgRouter);

  // ─── Error handler ─────────────────────────────────────────────────────────
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("API error", { err: String(err) });
    res.status(500).json({ error: "internal server error" });
  });

  return router;
}
