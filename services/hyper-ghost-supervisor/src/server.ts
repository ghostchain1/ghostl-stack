import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { ethers } from 'ethers';

import { loadConfig, type HgConfig } from './config.js';
import { openDb, type SqliteDb } from './db/sqlite.js';
import { runMigrations } from './db/migrate.js';
import { seedDemo } from './db/seed.js';
import { createMetrics } from './telemetry/prom.js';
import { startCollectors, type CollectorState } from './telemetry/collectors.js';
import { deriveGateState, GateError, guardExecute, guardMutating } from './policy/gates.js';
import { evaluateInvariants } from './policy/invariants.js';
import { fetchEvidence, fetchFixes, fetchIncident, fetchProposal, generateProposal } from './proposals/generator.js';
import { writeCmfBundle } from './proposals/manifest.js';
import { writeGovernanceTemplates } from './proposals/governance.js';
import { executeFix } from './exec/executor.js';
import type { Fix, Incident, Proposal } from './types/hgop.js';

const now = () => Math.floor(Date.now() / 1000);

const parseJson = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const normalizeIncidentRow = (row: any): Incident => ({
  incident_id: String(row.incident_id),
  ts: Number(row.ts),
  env: row.env,
  scope: String(row.scope),
  severity: row.severity,
  title: String(row.title),
  status: row.status,
  symptoms_json: parseJson(row.symptoms_json, {}),
  hypotheses_json: parseJson(row.hypotheses_json, []),
  evidence_refs_json: parseJson(row.evidence_refs_json, [])
});

const normalizeProposalRow = (row: any): Proposal => ({
  proposal_id: String(row.proposal_id),
  incident_id: String(row.incident_id),
  created_ts: Number(row.created_ts),
  constraints_json: parseJson(row.constraints_json, {}),
  signatures_json: parseJson(row.signatures_json, {}),
  status: row.status
});

const authTokenFromReq = (req: express.Request) =>
  (req.header('x-hgop-approval-token') || req.header('x-approval-token') || '').trim() || undefined;

const computeSupervisorRiskScore = (openBySeverity: Record<string, number>, failedProbes: number) => {
  let score = 0;
  if ((openBySeverity.P0 || 0) > 0) score += 35;
  if ((openBySeverity.P1 || 0) > 0) score += 20;
  if ((openBySeverity.P2 || 0) > 0) score += 10;
  if ((openBySeverity.P3 || 0) > 0) score += 5;
  if (failedProbes > 0) score += Math.min(30, failedProbes * 10);
  return Math.max(0, Math.min(100, score));
};

export function createApp(cfg: HgConfig, deps: { db?: SqliteDb; collectors?: CollectorState } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const db = deps.db ?? openDb(cfg.dbPath);
  if (cfg.migrate) {
    const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
    runMigrations(db, { migrationsDir });
  }
  if (cfg.seedDemo) {
    seedDemo(cfg.dbPath, cfg.env);
  }

  const metrics = createMetrics();
  const gateState = deriveGateState(cfg.env, cfg.execEnabled, cfg.approvalToken);
  const invariants = evaluateInvariants(gateState);

  // Gate metrics are static-ish, but we set them periodically to handle restarts reliably.
  const setGateMetrics = () => {
    const env = cfg.env;
    metrics.gateState.set({ env, gate: 'exec_enabled' }, cfg.execEnabled ? 1 : 0);
    metrics.gateState.set({ env, gate: 'approval_token_configured' }, cfg.approvalToken ? 1 : 0);
    metrics.gateState.set({ env, gate: 'mainnet_proposal_only' }, cfg.env === 'mainnet' ? 1 : 0);
  };
  setGateMetrics();

  const collectors = deps.collectors ?? startCollectors(cfg, db, metrics);

  const computeOpenCounts = () => {
    const rows = db
      .prepare("SELECT severity, COUNT(1) AS n FROM incidents WHERE env = ? AND status = 'open' GROUP BY severity")
      .all(cfg.env) as Array<{ severity: string; n: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.severity] = Number(r.n);
    return out;
  };

  const computeFailedProbes = () => collectors.lastProbes.filter((p) => !p.ok).length;

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: cfg.env,
      version: '1.0.0',
      time: new Date().toISOString(),
      gates: gateState,
      invariants
    });
  });

  app.get('/status', (_req, res) => {
    const openBySeverity = computeOpenCounts();
    const failedProbes = computeFailedProbes();
    const risk = computeSupervisorRiskScore(openBySeverity, failedProbes);
    metrics.riskScore.set(risk);
    setGateMetrics();

    res.json({
      ok: true,
      env: cfg.env,
      gates: gateState,
      openIncidents: openBySeverity,
      failedProbes,
      riskScore: risk,
      lastSnapshotHash: collectors.lastSnapshotHash,
      probes: collectors.lastProbes.slice(0, 50)
    });
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('content-type', metrics.registry.contentType);
    res.send(await metrics.registry.metrics());
  });

  app.get('/incidents', (req, res) => {
    const qs = z
      .object({
        status: z.string().optional(),
        scope: z.string().optional(),
        severity: z.string().optional(),
        env: z.string().optional()
      })
      .parse(req.query);
    const where: string[] = [];
    const params: any[] = [];

    const effectiveEnv = (qs.env || cfg.env) as string;
    where.push('env = ?');
    params.push(effectiveEnv);

    if (qs.status) {
      where.push('status = ?');
      params.push(qs.status);
    }
    if (qs.scope) {
      where.push('scope = ?');
      params.push(qs.scope);
    }
    if (qs.severity) {
      where.push('severity = ?');
      params.push(qs.severity);
    }

    const sql = `SELECT * FROM incidents WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT 200`;
    const rows = db.prepare(sql).all(...params) as any[];
    res.json({ ok: true, incidents: rows.map(normalizeIncidentRow) });
  });

  const IncidentCreateSchema = z.object({
    env: z.enum(['devnet', 'testnet', 'mainnet']).optional(),
    scope: z.string().min(1),
    severity: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
    title: z.string().min(1),
    status: z.enum(['open', 'mitigated', 'resolved', 'false_positive']).optional(),
    symptoms: z.unknown().default({}),
    hypotheses: z.unknown().default([]),
    evidenceRefs: z.unknown().default([])
  });

  app.post('/incidents', async (req, res) => {
    try {
      guardMutating(cfg.env, cfg.approvalToken, authTokenFromReq(req));
      const body = IncidentCreateSchema.parse(req.body || {});
      const incident_id = `inc_${crypto.randomUUID()}`;
      const ts = now();
      const env = body.env || cfg.env;
      db.prepare(
        `INSERT INTO incidents (
          incident_id, ts, env, scope, severity, title, status, symptoms_json, hypotheses_json, evidence_refs_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        incident_id,
        ts,
        env,
        body.scope,
        body.severity,
        body.title,
        body.status || 'open',
        JSON.stringify(body.symptoms ?? {}),
        JSON.stringify(body.hypotheses ?? []),
        JSON.stringify(body.evidenceRefs ?? [])
      );
      const row = db.prepare('SELECT * FROM incidents WHERE incident_id = ?').get(incident_id) as any;
      res.status(201).json({ ok: true, incident: normalizeIncidentRow(row) });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  app.get('/incidents/:id', (req, res) => {
    const id = String(req.params.id || '');
    const row = db.prepare('SELECT * FROM incidents WHERE incident_id = ?').get(id) as any;
    if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
    const evidence = fetchEvidence(db, id);
    res.json({ ok: true, incident: normalizeIncidentRow(row), evidence });
  });

  const EvidenceCreateSchema = z.object({
    kind: z.string().min(1),
    uri: z.string().min(1),
    sha256: z.string().optional()
  });

  app.post('/incidents/:id/evidence', (req, res) => {
    try {
      guardMutating(cfg.env, cfg.approvalToken, authTokenFromReq(req));
      const id = String(req.params.id || '');
      const incident = fetchIncident(db, id);
      if (!incident) return res.status(404).json({ ok: false, error: 'incident_not_found' });
      const body = EvidenceCreateSchema.parse(req.body || {});
      const evidence_id = `ev_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO evidence (evidence_id, incident_id, kind, uri, sha256, created_ts) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(evidence_id, id, body.kind, body.uri, body.sha256 || null, now());
      res.status(201).json({ ok: true, evidence_id });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  app.get('/proposals', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, i.env AS incident_env, i.scope AS incident_scope, i.severity AS incident_severity
         FROM proposals p
         JOIN incidents i ON i.incident_id = p.incident_id
         WHERE i.env = ?
         ORDER BY p.created_ts DESC
         LIMIT 200`
      )
      .all(cfg.env) as any[];
    res.json({
      ok: true,
      proposals: rows.map((r) => ({
        ...normalizeProposalRow(r),
        incident: { env: r.incident_env, scope: r.incident_scope, severity: r.incident_severity }
      }))
    });
  });

  app.get('/proposals/:id', (req, res) => {
    const id = String(req.params.id || '');
    const prop = fetchProposal(db, id);
    if (!prop) return res.status(404).json({ ok: false, error: 'not_found' });
    const incident = fetchIncident(db, prop.incident_id);
    const fixes = fetchFixes(db, id);
    const evidence = fetchEvidence(db, prop.incident_id);
    res.json({ ok: true, proposal: prop, incident, evidence, fixes });
  });

  const ProposalGenerateSchema = z.object({
    incidentId: z.string().min(1),
    constraints: z.record(z.string(), z.any()).optional()
  });

  app.post('/proposals/generate', (req, res) => {
    try {
      // devnet allowed, testnet/mainnet require approval token.
      guardMutating(cfg.env, cfg.approvalToken, authTokenFromReq(req));
      const body = ProposalGenerateSchema.parse(req.body || {});
      const health = { probes: collectors.lastProbes } as any;
      const constraints = body.constraints || {};
      const generated = generateProposal(db, body.incidentId, constraints, health);
      metrics.patchSuggestionsTotal.labels(cfg.env, generated.incident.scope).inc(generated.fixes.length);
      res.status(201).json({ ok: true, proposal: generated.proposal, fixes: generated.fixes });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  app.post('/proposals/:id/attest', async (req, res) => {
    try {
      if (cfg.env === 'mainnet') throw new GateError(403, 'MAINNET_PROPOSAL_ONLY');
      guardMutating(cfg.env, cfg.approvalToken, authTokenFromReq(req));
      const id = String(req.params.id || '');
      const prop = fetchProposal(db, id);
      if (!prop) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!cfg.attestorPrivateKey) return res.status(400).json({ ok: false, error: 'HG_ATTESTOR_PRIVATE_KEY_missing' });
      const incident = fetchIncident(db, prop.incident_id);
      const fixes = fetchFixes(db, prop.proposal_id);
      const message = JSON.stringify({ proposal: prop, incident, fixes });
      const wallet = new ethers.Wallet(cfg.attestorPrivateKey);
      const signature = await wallet.signMessage(message);
      const signatures = { signer: await wallet.getAddress(), signature, signedAt: new Date().toISOString() };
      db.prepare('UPDATE proposals SET signatures_json = ?, status = ? WHERE proposal_id = ?').run(
        JSON.stringify(signatures),
        'attested',
        prop.proposal_id
      );
      res.json({ ok: true, proposalId: prop.proposal_id, signatures });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  app.post('/proposals/:id/submit-governance', async (req, res) => {
    try {
      guardMutating(cfg.env, cfg.approvalToken, authTokenFromReq(req));
      const id = String(req.params.id || '');
      const prop = fetchProposal(db, id);
      if (!prop) return res.status(404).json({ ok: false, error: 'not_found' });
      const incident = fetchIncident(db, prop.incident_id);
      if (!incident) return res.status(404).json({ ok: false, error: 'incident_not_found' });
      const fixes = fetchFixes(db, prop.proposal_id);
      const evidence = fetchEvidence(db, prop.incident_id);

      const { governanceDir, manifestHash, baseDir } = await writeCmfBundle(cfg.artifactDir, prop, incident, fixes, evidence);
      await writeGovernanceTemplates(governanceDir, {
        l1ChainId: process.env.CHAIN_ID_L1 || process.env.CHAIN_ID || undefined,
        governanceGateAddress: process.env.HG_GOVERNANCE_GATE_ADDRESS,
        federationRegistryAddress: process.env.HG_FEDERATION_REGISTRY_ADDRESS,
        policyRegistryAddress: process.env.POLICY_REGISTRY_ADDRESS,
        manifestHash
      });

      db.prepare('UPDATE proposals SET status = ? WHERE proposal_id = ?').run('submitted', prop.proposal_id);
      res.json({ ok: true, proposalId: prop.proposal_id, cmfDir: baseDir, manifestHash });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  // Download CMF bundle artifacts.
  app.get('/artifacts/cmf/:proposalId/*tail', async (req, res) => {
    const proposalId = String(req.params.proposalId || '');
    const rawTail = (req.params as any).tail;
    const tail = Array.isArray(rawTail) ? rawTail.join('/') : String(rawTail || '');
    const base = path.join(cfg.artifactDir, 'CMF', proposalId);
    const requested = path.normalize(path.join(base, tail));
    if (!requested.startsWith(base)) return res.status(400).json({ ok: false, error: 'invalid_path' });
    try {
      const data = await fs.readFile(requested);
      const ct = requested.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      res.setHeader('content-type', ct);
      res.send(data);
    } catch {
      res.status(404).json({ ok: false, error: 'not_found' });
    }
  });

  app.post('/execute/:proposalId/:fixId', (req, res) => {
    try {
      guardExecute(cfg.env, cfg.execEnabled, cfg.approvalToken, authTokenFromReq(req));
      const proposalId = String(req.params.proposalId || '');
      const fixId = String(req.params.fixId || '');
      const fixRow = db.prepare('SELECT * FROM fixes WHERE proposal_id = ? AND fix_id = ?').get(proposalId, fixId) as any;
      if (!fixRow) return res.status(404).json({ ok: false, error: 'fix_not_found' });
      const fix: Fix = {
        fix_id: String(fixRow.fix_id),
        proposal_id: String(fixRow.proposal_id),
        rank: Number(fixRow.rank),
        description: String(fixRow.description),
        diff_summary: String(fixRow.diff_summary),
        risk_score: Number(fixRow.risk_score),
        blast_radius: fixRow.blast_radius,
        uncertainty: Number(fixRow.uncertainty),
        expected_benefit: Number(fixRow.expected_benefit),
        rollback_plan_json: parseJson(String(fixRow.rollback_plan_json || '{}'), {}),
        verification_steps_json: parseJson(String(fixRow.verification_steps_json || '[]'), []),
        required_gates: String(fixRow.required_gates),
        score: Number(fixRow.score || 0)
      };
      const exec = executeFix(db, proposalId, fix);
      res.json({ ok: true, execution: exec });
    } catch (e: any) {
      if (e instanceof GateError) return res.status(e.status).json({ ok: false, error: e.message });
      return res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'invalid_request' });
    }
  });

  app.get('/queue', (_req, res) => {
    res.json({ ok: true, queue: [], note: 'HGOP v1 does not maintain an execution queue (proposal-first).' });
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[hyper-ghost-supervisor] unhandled error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return { app, db, metrics, collectors };
}

export async function main() {
  const cfg = loadConfig(process.env);
  const { app } = createApp(cfg);
  app.listen(cfg.port, cfg.bind, () => {
    console.log(`[hyper-ghost-supervisor] listening on http://${cfg.bind}:${cfg.port} env=${cfg.env}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[hyper-ghost-supervisor] fatal', e);
    process.exit(1);
  });
}
