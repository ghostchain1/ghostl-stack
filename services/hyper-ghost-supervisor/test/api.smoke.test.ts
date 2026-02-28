import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import type http from 'node:http';

import { createApp } from '../src/server.js';
import { openDb } from '../src/db/sqlite.js';
import type { CollectorState } from '../src/telemetry/collectors.js';
import type { HgConfig } from '../src/config.js';

const startServer = (app: ReturnType<typeof createApp>['app']): Promise<{ server: http.Server; baseUrl: string }> =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'string' ? 0 : addr?.port || 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });

test('API smoke: health/status/incidents/proposals/metrics', async (t) => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgop-artifacts-'));
  const cfg: HgConfig = {
    env: 'devnet',
    bind: '127.0.0.1',
    port: 7077,
    dbPath: ':memory:',
    artifactDir,
    migrate: true,
    seedDemo: false,
    execEnabled: false,
    rpc: {},
    probes: { urls: [], timeoutMs: 50, intervalMs: 60_000 },
    ghostdns: { url: 'http://127.0.0.1:18089' }
  };

  const db = openDb(':memory:');
  const collectors: CollectorState = { startedAt: Date.now(), lastProbes: [], lastSnapshotHash: null };
  const { app } = createApp(cfg, { db, collectors });
  const { server, baseUrl } = await startServer(app);
  t.after(() => server.close());

  const health = await fetch(`${baseUrl}/health`).then((r) => r.json() as any);
  assert.equal(health.status, 'ok');
  assert.equal(health.env, 'devnet');

  const status = await fetch(`${baseUrl}/status`).then((r) => r.json() as any);
  assert.equal(status.ok, true);
  assert.equal(status.env, 'devnet');

  const created = await fetch(`${baseUrl}/incidents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'rollup:l3', severity: 'P1', title: 'smoke incident' })
  }).then((r) => r.json() as any);
  assert.equal(created.ok, true);
  assert.ok(created.incident?.incident_id);

  const incidentId = String(created.incident.incident_id);
  const evidence = await fetch(`${baseUrl}/incidents/${incidentId}/evidence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'test', uri: 'file://smoke' })
  }).then((r) => r.json() as any);
  assert.equal(evidence.ok, true);
  assert.ok(evidence.evidence_id);

  const proposalsGenerated = await fetch(`${baseUrl}/proposals/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ incidentId })
  }).then((r) => r.json() as any);
  assert.equal(proposalsGenerated.ok, true);
  assert.ok(proposalsGenerated.proposal?.proposal_id);
  assert.ok(Array.isArray(proposalsGenerated.fixes));
  assert.ok(proposalsGenerated.fixes.length > 0);

  const proposalId = String(proposalsGenerated.proposal.proposal_id);
  const proposalDetail = await fetch(`${baseUrl}/proposals/${proposalId}`).then((r) => r.json() as any);
  assert.equal(proposalDetail.ok, true);
  assert.equal(proposalDetail.proposal?.proposal_id, proposalId);
  assert.ok(Array.isArray(proposalDetail.fixes));

  const metricsText = await fetch(`${baseUrl}/metrics`).then((r) => r.text());
  assert.ok(metricsText.includes('hyperghost_uptime_seconds'));
});

test('Gate: mainnet execute is proposal-only (403)', async (t) => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgop-artifacts-'));
  const cfg: HgConfig = {
    env: 'mainnet',
    bind: '127.0.0.1',
    port: 7077,
    dbPath: ':memory:',
    artifactDir,
    migrate: true,
    seedDemo: false,
    execEnabled: true,
    approvalToken: 'token',
    rpc: {},
    probes: { urls: [], timeoutMs: 50, intervalMs: 60_000 },
    ghostdns: { url: 'http://127.0.0.1:18089' }
  };
  const db = openDb(':memory:');
  const collectors: CollectorState = { startedAt: Date.now(), lastProbes: [], lastSnapshotHash: null };
  const { app } = createApp(cfg, { db, collectors });
  const { server, baseUrl } = await startServer(app);
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/execute/prop_x/fix_y`, { method: 'POST' });
  assert.equal(res.status, 403);
  const body = (await res.json()) as any;
  assert.equal(body.error, 'MAINNET_PROPOSAL_ONLY');
});
