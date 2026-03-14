// server.ts — Express HTTP API for autonomous-vault-hypervisor
import express from 'express';
import { randomUUID } from 'node:crypto';
import { CFG } from './config.js';
import { metrics, renderPrometheus } from './metrics.js';
import { state, triggerReconcile } from './reconciler.js';
import { checkAction, getPolicy, setPolicy } from './policy-gate.js';
import { rotateSecret, vaultHealth } from './vault-client.js';
import {
  discoverVms, startVm, shutdownVm, destroyVm, restartVm,
  snapshotVm, domainInfo, listSnapshots,
} from './vm-manager.js';
import {
  discoverContainers, restartContainer, startContainer, stopContainer,
  inspectContainer, containerLogs, containerStats, pruneContainers, dockerAvailable,
} from './docker-manager.js';
import { publishAnomalySignal } from './ghostbrain.js';

export function createApp(): express.Application {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Request counter middleware
  app.use((_req, _res, next) => {
    metrics.apiRequests++;
    next();
  });

  // ─── Health & Status ──────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: CFG.serviceName, ts: new Date().toISOString() });
  });

  app.get('/status', async (_req, res) => {
    const vaultOk = await vaultHealth();
    const dockerOk = await dockerAvailable();
    res.json({
      ok: true,
      service: CFG.serviceName,
      vault: vaultOk,
      docker: { available: dockerOk },
      vms: state.vms.size,
      containers: state.containers.size,
      lastReconciled: state.lastReconciled ? new Date(state.lastReconciled).toISOString() : null,
      remediations: state.remediations.length,
      emergencyLock: CFG.emergencyLock,
      executeActions: CFG.executeActions,
    });
  });

  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(renderPrometheus());
  });

  // ─── VMs ──────────────────────────────────────────────────────────────────
  app.get('/v1/vms', (_req, res) => {
    res.json({ ok: true, vms: Array.from(state.vms.values()), total: state.vms.size });
  });

  app.get('/v1/vms/discover', async (_req, res) => {
    try {
      const vms = await discoverVms();
      res.json({ ok: true, vms, total: vms.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/vms/:name/info', async (req, res) => {
    try {
      const info = await domainInfo(req.params.name);
      res.json({ ok: true, info });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/vms/:name/snapshots', async (req, res) => {
    try {
      const snaps = await listSnapshots(req.params.name);
      res.json({ ok: true, snapshots: snaps });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/vms/:name/start', async (req, res) => {
    const { name } = req.params;
    const gate = checkAction('vm.start', name);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await startVm(name);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/vms/:name/stop', async (req, res) => {
    const { name } = req.params;
    const gate = checkAction('vm.stop', name);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await shutdownVm(name);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/vms/:name/destroy', async (req, res) => {
    const { name } = req.params;
    const gate = checkAction('vm.destroy', name);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await destroyVm(name);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/vms/:name/restart', async (req, res) => {
    const { name } = req.params;
    const gate = checkAction('vm.restart', name);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await restartVm(name);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/vms/:name/snapshot', async (req, res) => {
    const { name } = req.params;
    const gate = checkAction('vm.snapshot', name);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const snapName = req.body.name as string | undefined;
      const result = await snapshotVm(name, snapName);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Containers ───────────────────────────────────────────────────────────
  app.get('/v1/containers', (_req, res) => {
    res.json({ ok: true, containers: Array.from(state.containers.values()), total: state.containers.size });
  });

  app.get('/v1/containers/discover', async (_req, res) => {
    try {
      const containers = await discoverContainers();
      res.json({ ok: true, containers, total: containers.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/containers/:id/inspect', async (req, res) => {
    try {
      const info = await inspectContainer(req.params.id);
      if (!info) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, info });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/containers/:id/logs', async (req, res) => {
    try {
      const tail = Number(req.query.tail ?? 50);
      const logs = await containerLogs(req.params.id, tail);
      res.type('text/plain').send(logs);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/containers/:id/stats', async (req, res) => {
    try {
      const stats = await containerStats(req.params.id);
      res.type('text/plain').send(stats);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/containers/:id/start', async (req, res) => {
    const gate = checkAction('container.start', req.params.id);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await startContainer(req.params.id);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/containers/:id/stop', async (req, res) => {
    const gate = checkAction('container.stop', req.params.id);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await stopContainer(req.params.id);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/containers/:id/restart', async (req, res) => {
    const gate = checkAction('container.restart', req.params.id);
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const result = await restartContainer(req.params.id);
      res.json({ ok: result.ok, output: result.output });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post('/v1/containers/prune', async (_req, res) => {
    const gate = checkAction('container.prune', '*');
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const out = await pruneContainers();
      res.json({ ok: true, output: out });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Secrets / Vault ──────────────────────────────────────────────────────
  app.post('/v1/secrets/rotate', async (req, res) => {
    const gate = checkAction('secret.rotate', (req.body.path as string | undefined) ?? '*');
    if (!gate.allowed) return res.status(403).json({ ok: false, reason: gate.reason });
    try {
      const rule = req.body;
      const result = await rotateSecret(rule);
      if (result.ok) metrics.secretRotations++;
      else metrics.secretRotationFails++;
      res.json({ ok: result.ok, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/secrets/vault-health', async (_req, res) => {
    const health = await vaultHealth();
    res.json(health);
  });

  // ─── Policy ───────────────────────────────────────────────────────────────
  app.get('/v1/policy', (_req, res) => {
    res.json({ ok: true, policy: getPolicy() });
  });

  app.put('/v1/policy', (req, res) => {
    setPolicy(req.body);
    res.json({ ok: true, policy: getPolicy() });
  });

  // ─── Reconciler ───────────────────────────────────────────────────────────
  app.post('/v1/reconcile/trigger', async (_req, res) => {
    try {
      await triggerReconcile();
      res.json({ ok: true, triggeredAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/v1/reconcile/state', (_req, res) => {
    res.json({
      ok: true,
      lastReconciled: state.lastReconciled ? new Date(state.lastReconciled).toISOString() : null,
      lastVmDiscovery: state.lastVmDiscovery ? new Date(state.lastVmDiscovery).toISOString() : null,
      lastContainerDiscovery: state.lastContainerDiscovery
        ? new Date(state.lastContainerDiscovery).toISOString() : null,
      vms: state.vms.size,
      containers: state.containers.size,
    });
  });

  app.get('/v1/reconcile/remediations', (_req, res) => {
    const limit = Math.min(Number((_req.query.limit) ?? 100), 500);
    res.json({ ok: true, remediations: state.remediations.slice(-limit) });
  });

  // ─── Anomalies & Signals ──────────────────────────────────────────────────
  app.post('/v1/signals/anomaly', (req, res) => {
    const { metric, value, threshold } = req.body as { metric?: string; value?: number; threshold?: number };
    publishAnomalySignal(metric ?? 'manual', value ?? 1, threshold ?? 0);
    res.json({ ok: true, signalId: randomUUID() });
  });

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  return app;
}
