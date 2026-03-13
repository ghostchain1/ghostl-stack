/**
 * GhostStack AI Vault — Secret Controller
 * CRUD + rotation for vault secrets.
 *
 * Endpoints:
 *   POST   /vault/secret            — store a secret
 *   GET    /vault/secret/:id        — retrieve (path from query or param)
 *   DELETE /vault/secret/:id        — delete
 *   POST   /vault/secret/:id/rotate — rotate/regenerate
 *   GET    /vault/secrets           — list (namespace prefix)
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SecretManager } from '../core/secret-manager.js';
import type { SecurityBrain } from '../ai/security-brain.js';
import type { AuditLedger } from '../storage/audit-ledger.js';

export function buildSecretController(
  secretMgr: SecretManager,
  brain: SecurityBrain,
  audit: AuditLedger,
): Router {
  const router = Router();

  const actor = (req: Request): string =>
    (req as Request & { actor?: string }).actor ?? 'anonymous';

  // ── POST /vault/secret ───────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { path, value, namespace, expiresIn, metadata } = req.body as {
        path?: string;
        value?: string;
        namespace?: string;
        expiresIn?: number;
        metadata?: Record<string, string>;
      };

      if (!path || value === undefined) {
        res.status(400).json({ error: 'path and value are required' });
        return;
      }

      // Validate path format
      if (!path.startsWith('vault://')) {
        res.status(400).json({ error: 'path must start with vault://' });
        return;
      }

      // AI security check
      const verdict = brain.analyze({
        actorId:  actor(req),
        resource: path,
        action:   'secret.write',
        success:  true,
        ts:       Date.now(),
      });

      if (!verdict.allow) {
        res.status(403).json({ error: 'access blocked by security policy', reason: verdict.message });
        return;
      }

      const expiresAt = expiresIn ? Date.now() + expiresIn : undefined;
      const meta = await secretMgr.store(path, value, { actor: actor(req), namespace, expiresAt, metadata });
      res.status(201).json({ id: meta.id, path: meta.path, version: meta.version, createdAt: meta.createdAt });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/secret/:path ──────────────────────────────────────────────────
  // Path is base64url-encoded in the URL param
  router.get('/:encodedPath', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const path = decodeURIComponent(req.params['encodedPath'] ?? '');
      if (!path) {
        res.status(400).json({ error: 'path required' });
        return;
      }

      // AI security check
      const verdict = brain.analyze({
        actorId:  actor(req),
        resource: path,
        action:   'secret.read',
        success:  true,
        ts:       Date.now(),
      });

      if (!verdict.allow) {
        res.status(403).json({ error: 'access blocked', reason: verdict.message });
        return;
      }

      const secretVal = await secretMgr.get(path, actor(req));
      if (secretVal === null) {
        res.status(404).json({ error: 'secret not found or expired' });
        return;
      }

      res.json({ path, value: secretVal.value });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /vault/secret/:path ───────────────────────────────────────────────
  router.delete('/:encodedPath', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const path = decodeURIComponent(req.params['encodedPath'] ?? '');
      if (!path) {
        res.status(400).json({ error: 'path required' });
        return;
      }

      await secretMgr.delete(path, actor(req));
      res.json({ deleted: true, path });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /vault/secret/:path/rotate ─────────────────────────────────────────
  router.post('/:encodedPath/rotate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const path = decodeURIComponent(req.params['encodedPath'] ?? '');
      if (!path) {
        res.status(400).json({ error: 'path required' });
        return;
      }

      const { newValue } = req.body as { newValue?: string };

      const result = newValue
        ? await secretMgr.store(path, newValue, { actor: actor(req), metadata: { rotationReason: 'manual' } })
        : await secretMgr.rotate(path, { actor: actor(req), reason: 'api-requested' });

      // normalize result
      const version  = 'version'  in result ? result.version  : undefined;
      const updatedAt = 'updatedAt' in result ? result.updatedAt : Date.now();
      res.json({ rotated: true, path, version, updatedAt });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/secrets ───────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const namespace = String(req.query['namespace'] ?? '');
      const metas = secretMgr.list(namespace);
      const paths = metas.map(m => m.path);
      res.json({ paths, count: paths.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
