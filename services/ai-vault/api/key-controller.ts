/**
 * GhostStack AI Vault — Key Controller
 * Key generation, signing, rotation, and metadata retrieval.
 *
 * Endpoints:
 *   POST /vault/key/generate          — generate new key
 *   POST /vault/key/rotate            — rotate key by path
 *   POST /vault/key/:keyId/sign       — sign data with key
 *   GET  /vault/key/:keyId            — get key metadata
 *   GET  /vault/keys                  — list keys
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { KeyManager } from '../core/key-manager.js';
import type { SecurityBrain } from '../ai/security-brain.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { KeyAlgorithm, KeyPurpose, KeyLayer } from '../storage/key-database.js';

export function buildKeyController(
  keyMgr: KeyManager,
  brain: SecurityBrain,
  audit: AuditLedger,
): Router {
  const router = Router();

  const actor = (req: Request): string =>
    (req as Request & { actor?: string }).actor ?? 'anonymous';

  // ── POST /vault/key/generate ─────────────────────────────────────────────────
  router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, algorithm, purpose, layer, chainId, metadata } = req.body as {
        name?: string;
        algorithm?: KeyAlgorithm;
        purpose?: KeyPurpose;
        layer?: KeyLayer;
        chainId?: number;
        metadata?: Record<string, string>;
      };

      if (!name || !algorithm || !purpose) {
        res.status(400).json({ error: 'name, algorithm, and purpose are required' });
        return;
      }

      // Security check before key generation
      const verdict = brain.analyze({
        actorId:  actor(req),
        resource: `vault://key/${name}`,
        action:   'key.generate',
        success:  true,
        ts:       Date.now(),
      });

      if (!verdict.allow) {
        res.status(403).json({ error: 'blocked by security policy', reason: verdict.message });
        return;
      }

      const record = await keyMgr.generate({
        name, algorithm, purpose,
        layer: layer ?? 'l1',
        chainId,
        metadata: metadata ?? {},
        actor: actor(req),
      });

      res.status(201).json({
        id:        record.id,
        name:      record.name,
        algorithm: record.algorithm,
        purpose:   record.purpose,
        layer:     record.layer,
        state:     record.state,
        createdAt: record.createdAt,
        publicKey: record.publicKey,
        secretPath: record.secretPath,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /vault/key/rotate ───────────────────────────────────────────────────
  router.post('/rotate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyId, reason } = req.body as { keyId?: string; name?: string; reason?: string };
      if (!keyId) {
        res.status(400).json({ error: 'keyId is required' });
        return;
      }

      const result = await keyMgr.rotate(keyId, actor(req), reason ?? 'api-requested');
      if (!result.ok) {
        res.status(400).json({ error: result.error ?? 'rotation failed', keyId });
        return;
      }
      res.json({ rotated: true, keyId });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /vault/key/:keyId/sign ──────────────────────────────────────────────
  router.post('/:keyId/sign', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyId } = req.params;
      const { data, encoding } = req.body as { data?: string; encoding?: 'hex' | 'base64' };

      if (!keyId || !data) {
        res.status(400).json({ error: 'keyId and data are required' });
        return;
      }

      // High-risk op: AI security gate
      const verdict = brain.analyze({
        actorId:  actor(req),
        resource: `vault://key/${keyId}`,
        action:   'key.sign',
        success:  true,
        ts:       Date.now(),
      });

      if (!verdict.allow) {
        res.status(403).json({ error: 'blocked by security policy', reason: verdict.message });
        return;
      }

      const dataBuffer = Buffer.from(data, encoding ?? 'hex');
      const result     = await keyMgr.sign(keyId, dataBuffer, actor(req));

      res.json({ signature: result.signature, keyId });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/key/:keyId ────────────────────────────────────────────────────
  router.get('/:keyId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyId } = req.params;
      if (!keyId) {
        res.status(400).json({ error: 'keyId required' });
        return;
      }

      const record = keyMgr.getById(keyId);
      if (!record) {
        res.status(404).json({ error: 'key not found' });
        return;
      }

      // Return metadata only — never expose private key material
      res.json({
        id:           record.id,
        name:         record.name,
        algorithm:    record.algorithm,
        purpose:      record.purpose,
        layer:        record.layer,
        chainId:      record.chainId,
        state:        record.state,
        publicKey:    record.publicKey,
        secretPath:   record.secretPath,
        createdAt:    record.createdAt,
        updatedAt:    record.updatedAt,
        rotatedAt:    record.rotatedAt,
        rotationCount: record.rotationCount,
        riskScore:    record.riskScore,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /vault/keys ──────────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const records = keyMgr.list({ state: 'active' });
      const paths   = records.map(k => k.secretPath);
      res.json({ paths, count: paths.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
