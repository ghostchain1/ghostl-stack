import { Router, type Request } from 'express';
import type { SqliteDb } from '../db/sqlite.js';
import { GhostDnsClient } from '../integrations/ghostdns/ghostdns.client.js';
import { runGhostDnsDetectors } from '../integrations/ghostdns/ghostdns.detectors.js';
import { GateError, guardMutating } from '../policy/gates.js';
import {
  playbookReconcile,
  playbookRollbackLastGood,
  playbookSafeReload
} from '../integrations/ghostdns/ghostdns.playbooks.js';

type CreateGhostDnsRouterOpts = {
  db: SqliteDb;
  mode: 'devnet' | 'testnet' | 'mainnet';
  approvalToken?: string;
  ghostDnsUrl: string;
  ghostDnsSharedSecret?: string;
};

export function createGhostDnsRouter(opts: CreateGhostDnsRouterOpts) {
  const router = Router();
  const client = new GhostDnsClient({ baseUrl: opts.ghostDnsUrl, sharedSecret: opts.ghostDnsSharedSecret });
  const authTokenFromReq = (req: Request) =>
    (req.header('x-hgop-approval-token') || req.header('x-approval-token') || '').trim() || undefined;

  router.get('/status', async (_req, res) => {
    try {
      const [health, zone] = await Promise.all([client.health(), client.zone()]);
      const pendingApprovals = opts.db
        .prepare('SELECT COUNT(1) AS n FROM ghostdns_changes WHERE mode = ? AND approved = 0')
        .get(opts.mode) as any;
      res.json({ ok: true, health, zone, pendingApprovals: Number(pendingApprovals?.n || 0) });
    } catch (error) {
      res.status(502).json({ ok: false, error: String(error) });
    }
  });

  router.get('/metrics', async (_req, res) => {
    try {
      const metrics = await client.metrics();
      res.type('text/plain').send(metrics);
    } catch (error) {
      res.status(502).json({ ok: false, error: String(error) });
    }
  });

  router.post('/events', (req, res) => {
    const body = req.body || {};
    opts.db
      .prepare('INSERT INTO ghostdns_events (ts, level, type, message, payload_json) VALUES (?, ?, ?, ?, ?)')
      .run(
        Math.floor(Date.now() / 1000),
        String(body.level || 'info'),
        String(body.type || 'event'),
        String(body.message || ''),
        JSON.stringify(body.payload || {})
      );
    res.status(201).json({ ok: true });
  });

  router.post('/reconcile', async (_req, res) => {
    try {
      guardMutating(opts.mode, opts.approvalToken, authTokenFromReq(_req));
      const response = await playbookReconcile(opts.db, client, 'hgop', opts.mode);
      res.json({ ok: true, response });
    } catch (error) {
      if (error instanceof GateError) return res.status(error.status).json({ ok: false, error: error.message });
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.post('/safe-reload', async (_req, res) => {
    try {
      guardMutating(opts.mode, opts.approvalToken, authTokenFromReq(_req));
      const response = await playbookSafeReload(opts.db, client, 'hgop', opts.mode);
      res.json({ ok: true, response });
    } catch (error) {
      if (error instanceof GateError) return res.status(error.status).json({ ok: false, error: error.message });
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.post('/rollback-last-good', (req, res) => {
    try {
      guardMutating(opts.mode, opts.approvalToken, authTokenFromReq(req));
      const rollbackRef = String(req.body?.rollbackRef || 'latest');
      const response = playbookRollbackLastGood(opts.db, 'hgop', opts.mode, rollbackRef);
      res.json(response);
    } catch (error) {
      if (error instanceof GateError) return res.status(error.status).json({ ok: false, error: error.message });
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.post('/detectors/run', async (_req, res) => {
    try {
      const incidents = await runGhostDnsDetectors(opts.db, client, opts.mode);
      res.json({ ok: true, incidents });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  return router;
}
