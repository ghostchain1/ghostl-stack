/**
 * GhostStack AI Vault — Audit Controller
 * Exposes audit log query and statistics endpoints.
 *
 * Endpoints:
 *   GET /vault/audit        — query audit entries (filtered)
 *   GET /vault/audit/stats  — statistics for dashboard
 *   GET /vault/audit/verify — verify audit chain integrity
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuditLedger } from '../storage/audit-ledger.js';

export function buildAuditController(audit: AuditLedger): Router {
  const router = Router();

  // ── GET /vault/audit ─────────────────────────────────────────────────────────
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit  = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 1000);
      const since  = req.query['since']
        ? parseInt(String(req.query['since']), 10)
        : Date.now() - 86_400_000;  // Default: last 24 h

      const entries = audit.query({ since, limit });
      res.json({ entries, count: entries.length });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/audit/stats ───────────────────────────────────────────────────
  router.get('/stats', (req: Request, res: Response, next: NextFunction) => {
    try {
      const windowMs = parseInt(String(req.query['window'] ?? String(3_600_000)), 10);
      const since    = Date.now() - windowMs;
      const stats    = audit.stats(since);
      res.json({ stats, since, windowMs });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/audit/verify ──────────────────────────────────────────────────
  router.get('/verify', (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit  = Math.min(parseInt(String(req.query['limit'] ?? '10000'), 10), 50_000);
      const result = audit.verifyChain(limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/audit/recent ──────────────────────────────────────────────────
  router.get('/recent', (req: Request, res: Response, next: NextFunction) => {
    try {
      const n = Math.min(parseInt(String(req.query['n'] ?? '50'), 10), 500);
      const entries = audit.recent(n);
      res.json({ entries, count: entries.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
