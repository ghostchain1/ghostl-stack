/**
 * Infrastructure API — GhostBrain Auto-Scaling Dashboard
 *
 * Admin-only endpoints for the /dashboard/infrastructure panel.
 * All routes require `x-admin-token` header.
 *
 * The controller status endpoint drives the real-time dashboard;
 * individual cluster and decision endpoints power charts and tables.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import {
  getControllerStatus, startControlLoop, stopControlLoop, isRunning,
} from '../../../infrastructure/autoscale_controller.js';
import {
  listNodes, getClusterSnapshot, getScalingHistory,
  updateNodeTelemetry, drainAndRemoveNode, type NodeType, type Region,
} from '../../../infrastructure/cluster_manager.js';
import {
  evaluateStreamingCapacity, deployStreamingNode, handleViewerSurge,
} from '../../../infrastructure/streaming_scaler.js';
import {
  evaluateApiCapacity, spawnApiContainer, getCurrentRps,
} from '../../../infrastructure/api_scaler.js';
import {
  evaluateAllAIServices, deployAIWorker, getAIServiceSummary,
  type AIServiceType,
} from '../../../infrastructure/ai_service_scaler.js';
import { getRecentMetrics, getLatestMetrics } from '../../../infrastructure/load_monitor.js';

export const infrastructureRouter = Router();

// ── Auth guard ────────────────────────────────────────────────────────────────

function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!token || token !== process.env.ADMIN_API_TOKEN) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

infrastructureRouter.use(adminOnly);

// ── Controller lifecycle ──────────────────────────────────────────────────────

// GET /infrastructure/status — full dashboard payload
infrastructureRouter.get('/status', (_req, res) => {
  try {
    res.json({ ok: true, data: getControllerStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /infrastructure/controller/start
infrastructureRouter.post('/controller/start', (_req, res) => {
  startControlLoop();
  res.json({ ok: true, running: isRunning() });
});

// POST /infrastructure/controller/stop
infrastructureRouter.post('/controller/stop', (_req, res) => {
  stopControlLoop();
  res.json({ ok: true, running: isRunning() });
});

// ── Cluster nodes ─────────────────────────────────────────────────────────────

// GET /infrastructure/nodes?type=streaming_node&region=US_EAST&status=healthy
infrastructureRouter.get('/nodes', (req, res) => {
  const { type, region, status } = req.query as Record<string, string>;
  const nodes = listNodes({
    type:   type   as NodeType | undefined,
    region: region as Region   | undefined,
    status: status as any,
  });
  res.json({ ok: true, data: nodes });
});

// GET /infrastructure/snapshot
infrastructureRouter.get('/snapshot', (_req, res) => {
  res.json({ ok: true, data: getClusterSnapshot() });
});

// POST /infrastructure/nodes — manually provision a node
infrastructureRouter.post('/nodes', (req, res) => {
  const { type, region } = req.body as { type: NodeType; region: Region };
  if (!type || !region) {
    res.status(400).json({ error: 'type and region are required' });
    return;
  }
  try {
    const nodeId = type === 'streaming_node'
      ? deployStreamingNode(region)
      : type === 'api_node'
      ? spawnApiContainer(region)
      : deployAIWorker(type as any, region);
    res.status(201).json({ ok: true, nodeId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /infrastructure/nodes/:nodeId — drain and remove a node
infrastructureRouter.delete('/nodes/:nodeId', (req, res) => {
  try {
    drainAndRemoveNode(req.params.nodeId, 'Manual admin removal');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /infrastructure/nodes/:nodeId/telemetry — update node heartbeat
infrastructureRouter.put('/nodes/:nodeId/telemetry', (req, res) => {
  const { cpuPct, memoryMb, activeStreams, connections } = req.body as Record<string, number>;
  updateNodeTelemetry(req.params.nodeId, { cpuPct, memoryMb, activeStreams, connections });
  res.json({ ok: true });
});

// ── Scaling history ───────────────────────────────────────────────────────────

// GET /infrastructure/scaling/events?limit=50
infrastructureRouter.get('/scaling/events', (req, res) => {
  const limit = Math.min(Number((req.query.limit as string) ?? '50'), 200);
  res.json({ ok: true, data: getScalingHistory(limit) });
});

// GET /infrastructure/scaling/decisions?limit=50
infrastructureRouter.get('/scaling/decisions', (req, res) => {
  const db    = getDb();
  const limit = Math.min(Number((req.query.limit as string) ?? '50'), 200);
  const rows  = db.prepare(`
    SELECT * FROM scaling_decisions ORDER BY decided_at DESC LIMIT ?
  `).all(limit);
  res.json({ ok: true, data: rows });
});

// ── Load metrics ──────────────────────────────────────────────────────────────

// GET /infrastructure/metrics?limit=60
infrastructureRouter.get('/metrics', (req, res) => {
  const limit = Math.min(Number((req.query.limit as string) ?? '60'), 500);
  res.json({ ok: true, data: getRecentMetrics(limit) });
});

// GET /infrastructure/metrics/latest
infrastructureRouter.get('/metrics/latest', (_req, res) => {
  res.json({ ok: true, data: getLatestMetrics() });
});

// ── Domain evaluations ────────────────────────────────────────────────────────

// GET /infrastructure/evaluate/streaming
infrastructureRouter.get('/evaluate/streaming', (_req, res) => {
  res.json({ ok: true, data: evaluateStreamingCapacity() });
});

// GET /infrastructure/evaluate/api
infrastructureRouter.get('/evaluate/api', (_req, res) => {
  const rps = getCurrentRps();
  res.json({ ok: true, data: evaluateApiCapacity(rps) });
});

// GET /infrastructure/evaluate/ai
infrastructureRouter.get('/evaluate/ai', (_req, res) => {
  res.json({ ok: true, data: { services: evaluateAllAIServices(), summary: getAIServiceSummary() } });
});

// ── Surge response ────────────────────────────────────────────────────────────

// POST /infrastructure/surge/:streamId  { viewerCount }
infrastructureRouter.post('/surge/:streamId', (req, res) => {
  const { viewerCount } = req.body as { viewerCount: number };
  if (!viewerCount || viewerCount < 1) {
    res.status(400).json({ error: 'viewerCount required' });
    return;
  }
  handleViewerSurge(req.params.streamId, viewerCount);
  res.json({ ok: true });
});

// ── AI service telemetry ──────────────────────────────────────────────────────

// GET /infrastructure/ai-telemetry?service=fraud&hours=1
infrastructureRouter.get('/ai-telemetry', (req, res) => {
  const db      = getDb();
  const { service, hours = '1' } = req.query as Record<string, string>;
  let   sql     = `SELECT * FROM ai_service_telemetry WHERE recorded_at >= datetime('now', '-${Number(hours)} hours')`;
  const args: unknown[] = [];
  if (service) { sql += ` AND service = ?`; args.push(service); }
  sql += ` ORDER BY recorded_at DESC LIMIT 200`;
  res.json({ ok: true, data: db.prepare(sql).all(...args) });
});
